/**
 * File-per-entry directory store (v1.10.0 layout).
 *
 * Each entry lives in `<dir>/<dotted-key>.json` as a wrapper of the form
 * `{ value, meta?: { created?, updated? } }`. Store-level state lives in
 * sidecar files `_aliases.json` and `_confirm.json`. The lock file lives
 * *outside* the directory at `<dir>.lock` so bulk-op atomicity swaps can
 * rename the directory itself without clobbering the lock.
 *
 * This module implements the `ScopedStore` interface defined in `../store`,
 * so it is a drop-in replacement for `createScopedStore` — consumers above
 * the store layer see the same `UnifiedData` shape on load/save.
 *
 * Design and decisions: see GitHub issue #54 and `arch.storeLayout` in the
 * project codex.
 */

import fs from 'fs';
import path from 'path';
import { CodexData, CodexValue } from '../types';
import type { ScopedStore, UnifiedData } from '../store';
import { atomicWriteFileSync } from './atomicWrite';
import { withFileLock } from './fileLock';
import { flattenObject, expandFlatKeys } from './objectPath';
import { debug } from './debug';

// ── Types ──────────────────────────────────────────────────────────────

/** Optional metadata block inside a per-entry wrapper file. */
export interface EntryMeta {
  /** Timestamp of the entry's first write. Preserved across updates. */
  created?: number;
  /** Timestamp of the entry's most recent write. Bumped on every write. */
  updated?: number;
}

/** On-disk per-entry file format. */
export interface EntryWrapper {
  value: CodexValue;
  meta?: EntryMeta;
}

/** Cached state of one entry file. */
interface CachedEntry {
  wrapper: EntryWrapper;
  mtimeMs: number;
}

// ── File layout helpers ────────────────────────────────────────────────

const ALIASES_FILE = '_aliases.json';
const CONFIRM_FILE = '_confirm.json';
const ENTRY_FILE_SUFFIX = '.json';

/** True if a filename in the store directory represents an entry (not a sidecar). */
function isEntryFilename(name: string): boolean {
  return name.endsWith(ENTRY_FILE_SUFFIX) && !name.startsWith('_');
}

/** Converts an entry filename (`arch.storage.json`) to its dotted key (`arch.storage`). */
function keyFromFilename(name: string): string {
  return name.slice(0, -ENTRY_FILE_SUFFIX.length);
}

/** Converts a dotted key to its entry file path within the store directory. */
export function entryFilePath(dir: string, key: string): string {
  return path.join(dir, key + ENTRY_FILE_SUFFIX);
}

/** Returns the lock path sibling to the store directory. */
export function getStoreLockPath(dir: string): string {
  return dir + '.lock';
}

// ── Wrapper I/O ────────────────────────────────────────────────────────

/** Parses an entry file's contents into an EntryWrapper. Returns null on parse failure. */
export function parseEntryWrapper(raw: string): EntryWrapper | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!('value' in parsed)) return null;
    const wrapper: EntryWrapper = { value: parsed.value as CodexValue };
    if (parsed.meta && typeof parsed.meta === 'object') {
      // EntryMeta has only optional fields, so `object` satisfies it structurally.
      wrapper.meta = parsed.meta;
    }
    return wrapper;
  } catch {
    return null;
  }
}

/** Serializes an EntryWrapper to the pretty JSON format used on disk. */
export function serializeEntryWrapper(wrapper: EntryWrapper): string {
  return JSON.stringify(wrapper, null, 2);
}

/** Serializes a sidecar object (aliases or confirm) with sorted keys. */
function serializeSidecar<T extends Record<string, unknown>>(data: T): string {
  const sorted = Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
  );
  return JSON.stringify(sorted, null, 2);
}

/** Reads a sidecar file, returning an empty object on ENOENT or parse failure. */
function readSidecar<T>(filePath: string): T {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return (raw?.trim() ? JSON.parse(raw) : {}) as T;
  } catch (err) {
    if (!isENOENT(err)) {
      debug(`Failed to read sidecar ${filePath}: ${String(err)}`);
    }
    return {} as T;
  }
}

function isENOENT(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: string }).code === 'ENOENT'
  );
}

// ── Equality helpers ───────────────────────────────────────────────────

/**
 * Stable deep-equal for CodexValue shapes (string or nested object of strings).
 * Uses a sorted-key stringify so object key order doesn't affect equality.
 */
function stableStringify(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    const parts = keys.map(
      k => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])
    );
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(v);
}

function valueEquals(a: CodexValue, b: CodexValue): boolean {
  if (a === b) return true;
  return stableStringify(a) === stableStringify(b);
}

function shallowEquals<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

// ── The factory ────────────────────────────────────────────────────────

/**
 * Create a file-per-entry directory-backed ScopedStore.
 *
 * @param getDirPath  Function returning the absolute path to the store directory.
 * @param ensureDir   Function that ensures the store directory exists on disk
 *                    (called before any write). Mirrors createScopedStore's contract.
 */
export function createDirectoryStore(
  getDirPath: () => string,
  ensureDir: () => void
): ScopedStore {
  // Per-entry cache, keyed by dotted key. Each entry records its file mtime
  // so we can detect external writes between load() calls.
  const entryCache = new Map<string, CachedEntry>();
  // Sidecar caches — small, not mtime-tracked, refreshed on every scanAndSync().
  let aliasesCache: Record<string, string> | null = null;
  let confirmCache: Record<string, true> | null = null;

  function clear(): void {
    entryCache.clear();
    aliasesCache = null;
    confirmCache = null;
  }

  /**
   * Scan the directory and refresh caches: re-read any entry whose mtime has
   * changed, drop cache entries for files that no longer exist, and reload
   * the sidecars. Must be called with or without the lock depending on caller
   * context — save() calls it under the lock for authoritative current state.
   */
  function scanAndSync(): void {
    const dir = getDirPath();
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch (err) {
      if (isENOENT(err)) {
        entryCache.clear();
        aliasesCache = {};
        confirmCache = {};
        return;
      }
      throw err;
    }

    const seen = new Set<string>();
    for (const file of files) {
      if (!isEntryFilename(file)) continue;
      const filePath = path.join(dir, file);
      let mtimeMs: number;
      try {
        mtimeMs = fs.statSync(filePath).mtimeMs;
      } catch {
        continue;
      }
      const key = keyFromFilename(file);
      seen.add(key);
      const cached = entryCache.get(key);
      if (cached?.mtimeMs === mtimeMs) continue;
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const wrapper = parseEntryWrapper(raw);
        if (wrapper) {
          entryCache.set(key, { wrapper, mtimeMs });
        } else {
          debug(`Skipping unparseable entry file: ${filePath}`);
        }
      } catch (err) {
        debug(`Failed to read entry file ${filePath}: ${String(err)}`);
      }
    }

    // Drop cache entries for files that no longer exist.
    for (const key of [...entryCache.keys()]) {
      if (!seen.has(key)) entryCache.delete(key);
    }

    // Refresh sidecar caches. Small files, re-read on every scan.
    aliasesCache = readSidecar<Record<string, string>>(path.join(dir, ALIASES_FILE));
    confirmCache = readSidecar<Record<string, true>>(path.join(dir, CONFIRM_FILE));
  }

  function load(): UnifiedData {
    scanAndSync();

    // Assemble the nested `entries` tree from the flat per-key cache.
    const flat: Record<string, CodexValue> = {};
    const meta: Record<string, number> = {};
    for (const [key, cached] of entryCache) {
      flat[key] = cached.wrapper.value;
      if (cached.wrapper.meta?.updated !== undefined) {
        meta[key] = cached.wrapper.meta.updated;
      }
    }
    const entries = expandFlatKeys(flat) as CodexData;

    const result: UnifiedData = {
      entries,
      aliases: aliasesCache ?? {},
      confirm: confirmCache ?? {},
    };
    if (Object.keys(meta).length > 0) {
      result._meta = meta;
    }
    return result;
  }

  function save(data: UnifiedData): void {
    const dir = getDirPath();
    ensureDir();

    withFileLock(getStoreLockPath(dir), () => {
      // 1. Flatten new entries to leaves (authoritative new state).
      const newFlat = flattenObject(data.entries as Record<string, unknown>);

      // 2. Re-scan under the lock for authoritative current state.
      scanAndSync();

      // 3. Compute deltas.
      const toDelete: string[] = [];
      for (const key of entryCache.keys()) {
        if (!(key in newFlat)) toDelete.push(key);
      }
      const toWrite: [string, CodexValue, number | undefined][] = [];
      for (const [key, value] of Object.entries(newFlat)) {
        const current = entryCache.get(key);
        const newUpdated = data._meta?.[key];
        const unchanged =
          !!current &&
          valueEquals(current.wrapper.value, value) &&
          current.wrapper.meta?.updated === newUpdated;
        if (!unchanged) toWrite.push([key, value, newUpdated]);
      }

      // 4. Apply deltas. Each atomicWriteFileSync is individually atomic;
      //    within the directory lock, multi-file writes are serialized against
      //    other writers (other readers may observe a partial state, but each
      //    individual file read is atomic so they see consistent values).
      for (const key of toDelete) {
        try {
          fs.unlinkSync(entryFilePath(dir, key));
        } catch (err) {
          if (!isENOENT(err)) {
            debug(`Failed to delete entry file for ${key}: ${String(err)}`);
          }
        }
        entryCache.delete(key);
      }
      for (const [key, value, updated] of toWrite) {
        // Preserve `meta.created` from the existing wrapper if present; set it
        // to `updated` only on first write. Untracked entries (migrated without
        // a timestamp) stay bare — no `meta` block at all.
        const existingCreated = entryCache.get(key)?.wrapper.meta?.created;
        const wrapper: EntryWrapper = updated !== undefined
          ? { value, meta: { created: existingCreated ?? updated, updated } }
          : { value };
        const filePath = entryFilePath(dir, key);
        atomicWriteFileSync(filePath, serializeEntryWrapper(wrapper));
        const mtimeMs = fs.statSync(filePath).mtimeMs;
        entryCache.set(key, { wrapper, mtimeMs });
      }

      // 5. Sidecars — rewrite only if changed.
      if (!aliasesCache || !shallowEquals(aliasesCache, data.aliases)) {
        atomicWriteFileSync(
          path.join(dir, ALIASES_FILE),
          serializeSidecar(data.aliases)
        );
        aliasesCache = { ...data.aliases };
      }
      if (!confirmCache || !shallowEquals(confirmCache, data.confirm)) {
        atomicWriteFileSync(
          path.join(dir, CONFIRM_FILE),
          serializeSidecar(data.confirm)
        );
        confirmCache = { ...data.confirm };
      }
    });
  }

  function prime(): void {
    // No-op: the new migration path writes the directory directly and lets the
    // next load() scan fresh. `prime` is kept only to satisfy the ScopedStore
    // interface during the transition; it will be removed with the old
    // createScopedStore in a later commit. (TypeScript allows a zero-arg
    // implementation to satisfy a typed signature with extra positional args.)
  }

  return { load, save, clear, prime };
}
