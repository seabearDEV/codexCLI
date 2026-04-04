import fs from 'fs';
import path from 'path';
import { CodexData } from './types';
import { getUnifiedDataFilePath, getDataDirectory, getAliasFilePath, getConfirmFilePath, ensureDataDirectoryExists, findProjectFile, clearProjectFileCache } from './utils/paths';

export { findProjectFile, clearProjectFileCache } from './utils/paths';
import { saveJsonSorted } from './utils/saveJsonSorted';
import { debug } from './utils/debug';

// ── Types ──────────────────────────────────────────────────────────────

interface UnifiedData {
  entries: CodexData;
  aliases: Record<string, string>;
  confirm: Record<string, true>;
  _meta?: Record<string, number> | undefined;
}

export type Scope = 'project' | 'global' | 'auto';


// ── ScopedStore ────────────────────────────────────────────────────────

interface ScopedStore {
  load(): UnifiedData;
  save(data: UnifiedData): void;
  clear(): void;
  prime(data: UnifiedData, mtime: number): void;
}

function createScopedStore(getFilePath: () => string, ensureDir: () => void): ScopedStore {
  let cache: UnifiedData | null = null;
  let cacheMtime: number | null = null;

  function clear(): void {
    cache = null;
    cacheMtime = null;
  }

  function load(): UnifiedData {
    const filePath = getFilePath();

    // Fast path: mtime cache hit
    if (cache !== null && cacheMtime !== null) {
      try {
        if (fs.statSync(filePath).mtimeMs === cacheMtime) {
          return cache;
        }
      } catch {
        clear();
      }
    }

    try {
      const currentMtime = fs.statSync(filePath).mtimeMs;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = (raw?.trim() ? JSON.parse(raw) : {}) as Record<string, unknown>;

      const result: UnifiedData = {
        entries: (parsed.entries ?? {}) as CodexData,
        aliases: (parsed.aliases ?? {}) as Record<string, string>,
        confirm: (parsed.confirm ?? {}) as Record<string, true>,
        _meta: (parsed._meta ?? undefined) as Record<string, number> | undefined,
      };

      cache = result;
      cacheMtime = currentMtime;
      return result;
    } catch (error) {
      // File doesn't exist — return empty data
      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT') {
        return { entries: {}, aliases: {}, confirm: {} };
      }
      if (!(error instanceof SyntaxError && error.message.includes('Unexpected end'))) {
        console.error('Error loading data:', error);
      }
      return { entries: {}, aliases: {}, confirm: {} };
    }
  }

  function save(data: UnifiedData): void {
    const filePath = getFilePath();
    try {
      ensureDir();
      // Sort each section's keys before saving
      const sorted: Record<string, unknown> = {
        aliases: Object.fromEntries(Object.entries(data.aliases).sort(([a], [b]) => a.localeCompare(b))),
        confirm: Object.fromEntries(Object.entries(data.confirm).sort(([a], [b]) => a.localeCompare(b))),
        entries: data.entries, // entries are nested — saveJsonSorted handles top-level sort
      };
      if (data._meta && Object.keys(data._meta).length > 0) {
        sorted._meta = Object.fromEntries(Object.entries(data._meta).sort(([a], [b]) => a.localeCompare(b)));
      }
      saveJsonSorted(filePath, sorted);
      const mtime = fs.statSync(filePath).mtimeMs;
      cache = data;
      cacheMtime = mtime;
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  function prime(data: UnifiedData, mtime: number): void {
    cache = data;
    cacheMtime = mtime;
  }

  return { load, save, clear, prime };
}

// ── Global store singleton ─────────────────────────────────────────────

let globalStore: ScopedStore | null = null;
let migrationDone = false;

function getGlobalStore(): ScopedStore {
  if (!globalStore) {
    globalStore = createScopedStore(getUnifiedDataFilePath, ensureDataDirectoryExists);
    if (!migrationDone) {
      const primed = migrateToUnifiedFile();
      if (primed) {
        globalStore.prime(primed.data, primed.mtime);
      }
      migrationDone = true;
    }
  }
  return globalStore;
}

// ── Project store singleton ────────────────────────────────────────────

let projectStore: ScopedStore | null = null;
let projectStorePath: string | null = null;

function getProjectStore(): ScopedStore | null {
  const projectFile = findProjectFile();
  if (!projectFile) {
    projectStore = null;
    projectStorePath = null;
    return null;
  }

  // If the path changed (shouldn't normally happen within one process), recreate
  if (projectStorePath !== projectFile) {
    let dirEnsured = false;
    projectStore = createScopedStore(
      () => projectFile,
      () => {
        if (!dirEnsured) {
          const dir = path.dirname(projectFile);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
          }
          dirEnsured = true;
        }
      }
    );
    projectStorePath = projectFile;
  }

  return projectStore;
}

// ── Scope resolution ───────────────────────────────────────────────────

function getEffectiveScope(scope?: Scope | undefined): 'project' | 'global' {
  if (scope === 'project') return 'project';
  if (scope === 'global') return 'global';
  // auto: use project if available
  return findProjectFile() ? 'project' : 'global';
}

function resolveStore(scope?: Scope | undefined): ScopedStore {
  const effective = getEffectiveScope(scope);
  if (effective === 'project') {
    const ps = getProjectStore();
    if (ps) return ps;
    // Fallback to global if project file doesn't exist (shouldn't happen with getEffectiveScope)
  }
  return getGlobalStore();
}

// ── Section accessors ──────────────────────────────────────────────────

export function loadEntries(scope?: Scope | undefined): CodexData {
  return resolveStore(scope).load().entries;
}

export function saveEntries(data: CodexData, scope?: Scope | undefined): void {
  const store = resolveStore(scope);
  const current = store.load();
  store.save({ ...current, entries: data });
}

export function loadAliasMap(scope?: Scope | undefined): Record<string, string> {
  return resolveStore(scope).load().aliases;
}

export function saveAliasMap(data: Record<string, string>, scope?: Scope | undefined): void {
  const store = resolveStore(scope);
  const current = store.load();
  store.save({ ...current, aliases: data });
}

export function loadConfirmMap(scope?: Scope | undefined): Record<string, true> {
  return resolveStore(scope).load().confirm;
}

export function saveConfirmMap(data: Record<string, true>, scope?: Scope | undefined): void {
  const store = resolveStore(scope);
  const current = store.load();
  store.save({ ...current, confirm: data });
}

// ── Merged accessors (project + global fallthrough) ────────────────────

export function loadEntriesMerged(): CodexData {
  const project = getProjectStore();
  const global = getGlobalStore();
  if (!project) return global.load().entries;

  const globalEntries = global.load().entries;
  const projectEntries = project.load().entries;
  // Shallow merge: project top-level keys override global
  return { ...globalEntries, ...projectEntries };
}

export function loadAliasMapMerged(): Record<string, string> {
  const project = getProjectStore();
  const global = getGlobalStore();
  if (!project) return global.load().aliases;

  return { ...global.load().aliases, ...project.load().aliases };
}

export function loadConfirmMapMerged(): Record<string, true> {
  const project = getProjectStore();
  const global = getGlobalStore();
  if (!project) return global.load().confirm;

  return { ...global.load().confirm, ...project.load().confirm };
}

// ── Cache management ───────────────────────────────────────────────────

export function clearStoreCaches(): void {
  globalStore?.clear();
  projectStore?.clear();
  // Reset singletons so migration re-runs on next access
  globalStore = null;
  projectStore = null;
  projectStorePath = null;
  migrationDone = false;
  clearProjectFileCache();
}

// ── Meta (staleness tracking) ─────────────────────────────────────────

export function loadMeta(scope?: Scope | undefined): Record<string, number> {
  return resolveStore(scope).load()._meta ?? {};
}

export function touchMeta(key: string, scope?: Scope | undefined): void {
  const store = resolveStore(scope);
  const current = store.load();
  const meta = { ...(current._meta ?? {}), [key]: Date.now() };
  store.save({ ...current, _meta: meta });
}

export function removeMeta(key: string, scope?: Scope | undefined): void {
  const store = resolveStore(scope);
  const current = store.load();
  if (!current._meta) return;
  const meta = { ...current._meta };
  // Remove exact key and any children (e.g., removing "server" also removes "server.ip")
  const prefix = key + '.';
  for (const k of Object.keys(meta)) {
    if (k === key || k.startsWith(prefix)) delete meta[k];
  }
  store.save({ ...current, _meta: meta });
}

export function loadMetaMerged(): Record<string, number> {
  const project = getProjectStore();
  const global = getGlobalStore();
  if (!project) return global.load()._meta ?? {};
  return { ...(global.load()._meta ?? {}), ...(project.load()._meta ?? {}) };
}

// ── Migration ──────────────────────────────────────────────────────────

function migrateToUnifiedFile(): { data: UnifiedData; mtime: number } | null {
  const unifiedPath = getUnifiedDataFilePath();

  // If unified file already exists, check if it's the new format
  try {
    const stat = fs.statSync(unifiedPath);
    const raw = fs.readFileSync(unifiedPath, 'utf8');
    const parsed = (raw?.trim() ? JSON.parse(raw) : {}) as Record<string, unknown>;
    if ('entries' in parsed && typeof parsed.entries === 'object') {
      // Already in new format — return parsed data to prime the store cache
      return {
        data: {
          entries: (parsed.entries ?? {}) as CodexData,
          aliases: (parsed.aliases ?? {}) as Record<string, string>,
          confirm: (parsed.confirm ?? {}) as Record<string, true>,
        },
        mtime: stat.mtimeMs,
      };
    }
    // Legacy data.json (entries-only from pre-rename era)
    // Treat entire content as entries
    debug('Migrating legacy data.json (entries-only) to unified format');
    const legacyEntries = parsed as CodexData;
    const unified: UnifiedData = {
      entries: legacyEntries,
      aliases: readJsonFileOr<Record<string, string>>(getAliasFilePath()),
      confirm: readJsonFileOr<Record<string, true>>(getConfirmFilePath()),
    };
    ensureDataDirectoryExists();
    saveJsonSorted(unifiedPath, unified as unknown as Record<string, unknown>);
    backupOldFile(getAliasFilePath());
    backupOldFile(getConfirmFilePath());
    return null;
  } catch (error) {
    // File doesn't exist — fall through to check old separate files
    if (!(error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT')) {
      // Non-ENOENT error (parse failure, etc.) — fall through to migration
    }
  }

  // Check for old separate files
  const dataDir = getDataDirectory();
  const entriesPath = path.join(dataDir, 'entries.json');
  const oldDataPath = path.join(dataDir, 'data.json'); // pre-rename era
  const aliasPath = getAliasFilePath();
  const confirmPath = getConfirmFilePath();

  const hasEntries = fs.existsSync(entriesPath);
  const hasOldData = fs.existsSync(oldDataPath);
  const hasAliases = fs.existsSync(aliasPath);
  const hasConfirm = fs.existsSync(confirmPath);

  if (!hasEntries && !hasOldData && !hasAliases && !hasConfirm) {
    // Fresh install, nothing to migrate
    return null;
  }

  debug('Migrating separate files to unified data.json');

  let entries: CodexData = {};
  if (hasEntries) {
    entries = readJsonFileOr<CodexData>(entriesPath);
  } else if (hasOldData) {
    entries = readJsonFileOr<CodexData>(oldDataPath);
  }

  const unified: UnifiedData = {
    entries,
    aliases: hasAliases ? readJsonFileOr<Record<string, string>>(aliasPath) : {},
    confirm: hasConfirm ? readJsonFileOr<Record<string, true>>(confirmPath) : {},
  };

  ensureDataDirectoryExists();
  saveJsonSorted(unifiedPath, unified as unknown as Record<string, unknown>);

  // Backup old files
  if (hasEntries) backupOldFile(entriesPath);
  if (hasOldData && !hasEntries) backupOldFile(oldDataPath);
  if (hasAliases) backupOldFile(aliasPath);
  if (hasConfirm) backupOldFile(confirmPath);
  return null;
}

function readJsonFileOr<T>(filePath: string): T {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return (content?.trim() ? JSON.parse(content) : {}) as T;
  } catch {
    return {} as T;
  }
}

function backupOldFile(filePath: string): void {
  const backupPath = filePath + '.backup';
  try {
    if (fs.existsSync(filePath)) {
      fs.renameSync(filePath, backupPath);
      debug(`Backed up ${filePath} -> ${backupPath}`);
    }
  } catch (err) {
    debug(`Failed to backup ${filePath}: ${String(err)}`);
  }
}
