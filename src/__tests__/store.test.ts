import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;
let dataPath: string;

vi.mock('../utils/paths', () => ({
  getDataDirectory: () => tmpDir,
  getUnifiedDataFilePath: () => path.join(tmpDir, 'data.json'),
  getAliasFilePath: () => path.join(tmpDir, 'aliases.json'),
  getConfirmFilePath: () => path.join(tmpDir, 'confirm.json'),
  ensureDataDirectoryExists: () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  },
  findProjectFile: () => null,
  clearProjectFileCache: () => {},
}));

import {
  loadEntries, saveEntries, loadAliasMap, saveAliasMap,
  loadConfirmMap, saveConfirmMap, loadEntriesMerged,
  loadAliasMapMerged, loadConfirmMapMerged,
  clearStoreCaches, loadMeta, touchMeta, removeMeta,
  saveEntriesAndTouchMeta, saveEntriesAndRemoveMeta,
  loadMetaMerged, getStalenessTag, STALE_DAYS, STALE_MS,
} from '../store';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-store-'));
  dataPath = path.join(tmpDir, 'data.json');
  clearStoreCaches();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Helper ────────────────────────────────────────────────────────────

function writeData(data: Record<string, unknown>): void {
  fs.writeFileSync(dataPath, JSON.stringify(data));
}

function readData(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

// ── ScopedStore: load/save cycle ─────────────────────────────────────

describe('ScopedStore load/save cycle', () => {
  it('returns empty data when file does not exist', () => {
    const entries = loadEntries('global');
    expect(entries).toEqual({});
  });

  it('loads entries from valid data.json', () => {
    writeData({ entries: { foo: 'bar' }, aliases: {}, confirm: {} });
    clearStoreCaches();
    expect(loadEntries('global')).toEqual({ foo: 'bar' });
  });

  it('saves and reloads entries', () => {
    writeData({ entries: {}, aliases: {}, confirm: {} });
    clearStoreCaches();

    saveEntries({ project: { name: 'test' } }, 'global');
    clearStoreCaches();

    expect(loadEntries('global')).toEqual({ project: { name: 'test' } });
  });

  it('preserves aliases and confirm when saving entries', () => {
    writeData({
      entries: { a: '1' },
      aliases: { short: 'long.key' },
      confirm: { 'commands.deploy': true },
    });
    clearStoreCaches();

    saveEntries({ a: '2' }, 'global');
    const raw = readData();
    expect(raw.aliases).toEqual({ short: 'long.key' });
    expect(raw.confirm).toEqual({ 'commands.deploy': true });
  });

  it('sorts keys in saved JSON', () => {
    writeData({ entries: {}, aliases: {}, confirm: {} });
    clearStoreCaches();

    saveAliasMap({ zulu: 'z.key', alpha: 'a.key' }, 'global');
    const raw = fs.readFileSync(dataPath, 'utf8');
    const alphaIdx = raw.indexOf('"alpha"');
    const zuluIdx = raw.indexOf('"zulu"');
    expect(alphaIdx).toBeLessThan(zuluIdx);
  });
});

// ── Mtime caching ────────────────────────────────────────────────────

describe('mtime caching', () => {
  it('returns cached data on repeated loads without file change', () => {
    writeData({ entries: { x: '1' }, aliases: {}, confirm: {} });
    clearStoreCaches();

    const first = loadEntries('global');
    const second = loadEntries('global');
    expect(first).toBe(second); // same reference = cache hit
  });

  it('invalidates cache when file is externally modified', () => {
    writeData({ entries: { x: '1' }, aliases: {}, confirm: {} });
    clearStoreCaches();

    loadEntries('global');

    // External modification (simulate another process)
    const newContent = JSON.stringify({ entries: { x: '2' }, aliases: {}, confirm: {} });
    // Need a different mtime — touch after a small delay
    const originalMtime = fs.statSync(dataPath).mtimeMs;
    // Force different mtime
    fs.writeFileSync(dataPath, newContent);
    const fd = fs.openSync(dataPath, 'r+');
    fs.futimesSync(fd, new Date(), new Date(originalMtime + 1000));
    fs.closeSync(fd);

    const reloaded = loadEntries('global');
    expect(reloaded).toEqual({ x: '2' });
  });

  it('clearStoreCaches forces a fresh read', () => {
    writeData({ entries: { x: '1' }, aliases: {}, confirm: {} });
    clearStoreCaches();

    const first = loadEntries('global');
    expect(first).toEqual({ x: '1' });

    // Overwrite the file without changing mtime would normally cache-hit,
    // but clearStoreCaches should force a fresh read
    writeData({ entries: { x: 'changed' }, aliases: {}, confirm: {} });
    clearStoreCaches();

    const second = loadEntries('global');
    expect(second).toEqual({ x: 'changed' });
  });
});

// ── Error recovery ───────────────────────────────────────────────────

describe('error recovery', () => {
  it('returns empty data for corrupt JSON', () => {
    fs.writeFileSync(dataPath, '{ not valid json !!!');
    clearStoreCaches();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const entries = loadEntries('global');
    expect(entries).toEqual({});
    consoleSpy.mockRestore();
  });

  it('returns empty data for empty file', () => {
    fs.writeFileSync(dataPath, '');
    clearStoreCaches();

    const entries = loadEntries('global');
    expect(entries).toEqual({});
  });

  it('returns empty data for file with only whitespace', () => {
    fs.writeFileSync(dataPath, '   \n\n  ');
    clearStoreCaches();

    const entries = loadEntries('global');
    expect(entries).toEqual({});
  });

  it('returns empty data for truncated JSON without logging to console', () => {
    fs.writeFileSync(dataPath, '{"entries":');
    clearStoreCaches();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadEntries('global');
    // SyntaxError with "Unexpected end" should not log
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('treats file without entries key as legacy and migrates it', () => {
    // A file without an "entries" key is treated as legacy (entries-only format)
    // The entire content becomes the entries
    writeData({ aliases: { x: 'y' }, confirm: {} });
    clearStoreCaches();

    const entries = loadEntries('global');
    // Legacy migration wraps the entire content as entries
    expect(entries).toEqual({ aliases: { x: 'y' }, confirm: {} });
  });
});

// ── Alias/confirm sections ───────────────────────────────────────────

describe('alias and confirm sections', () => {
  it('loads and saves alias maps', () => {
    writeData({ entries: {}, aliases: { a: 'b' }, confirm: {} });
    clearStoreCaches();

    expect(loadAliasMap('global')).toEqual({ a: 'b' });

    saveAliasMap({ c: 'd' }, 'global');
    clearStoreCaches();

    expect(loadAliasMap('global')).toEqual({ c: 'd' });
  });

  it('loads and saves confirm maps', () => {
    writeData({ entries: {}, aliases: {}, confirm: { 'x.y': true } });
    clearStoreCaches();

    expect(loadConfirmMap('global')).toEqual({ 'x.y': true });

    saveConfirmMap({ 'a.b': true }, 'global');
    clearStoreCaches();

    expect(loadConfirmMap('global')).toEqual({ 'a.b': true });
  });
});

// ── Meta operations ──────────────────────────────────────────────────

describe('meta operations', () => {
  it('saveEntriesAndTouchMeta writes both in one save', () => {
    writeData({ entries: {}, aliases: {}, confirm: {} });
    clearStoreCaches();

    saveEntriesAndTouchMeta({ foo: 'bar' }, 'foo', 'global');

    const raw = readData();
    expect(raw.entries).toEqual({ foo: 'bar' });
    expect((raw._meta as Record<string, number>).foo).toBeGreaterThan(0);
  });

  it('saveEntriesAndRemoveMeta removes key and children', () => {
    writeData({
      entries: { srv: { ip: '1' } },
      aliases: {},
      confirm: {},
      _meta: { 'srv': 100, 'srv.ip': 200, 'other': 300 },
    });
    clearStoreCaches();

    saveEntriesAndRemoveMeta({}, 'srv', 'global');

    const meta = loadMeta('global');
    expect(meta['srv']).toBeUndefined();
    expect(meta['srv.ip']).toBeUndefined();
    expect(meta['other']).toBe(300);
  });

  it('saveEntriesAndRemoveMeta is safe when no _meta exists', () => {
    writeData({ entries: { a: 'b' }, aliases: {}, confirm: {} });
    clearStoreCaches();

    saveEntriesAndRemoveMeta({ c: 'd' }, 'a', 'global');

    const raw = readData();
    expect(raw.entries).toEqual({ c: 'd' });
    expect(raw._meta).toBeUndefined();
  });

  it('touchMeta updates timestamp for existing key', () => {
    const old = Date.now() - 100000;
    writeData({
      entries: { foo: 'bar' },
      aliases: {},
      confirm: {},
      _meta: { foo: old },
    });
    clearStoreCaches();

    touchMeta('foo', 'global');

    const meta = loadMeta('global');
    expect(meta.foo).toBeGreaterThan(old);
  });
});

// ── Merged accessors ─────────────────────────────────────────────────

describe('merged accessors (global-only, no project)', () => {
  it('loadEntriesMerged returns global entries when no project', () => {
    writeData({ entries: { g: 'global' }, aliases: {}, confirm: {} });
    clearStoreCaches();

    expect(loadEntriesMerged()).toEqual({ g: 'global' });
  });

  it('loadAliasMapMerged returns global aliases when no project', () => {
    writeData({ entries: {}, aliases: { a: 'b' }, confirm: {} });
    clearStoreCaches();

    expect(loadAliasMapMerged()).toEqual({ a: 'b' });
  });

  it('loadConfirmMapMerged returns global confirm when no project', () => {
    writeData({ entries: {}, aliases: {}, confirm: { x: true } });
    clearStoreCaches();

    expect(loadConfirmMapMerged()).toEqual({ x: true });
  });

  it('loadMetaMerged returns global meta when no project', () => {
    writeData({ entries: {}, aliases: {}, confirm: {}, _meta: { k: 123 } });
    clearStoreCaches();

    expect(loadMetaMerged()).toEqual({ k: 123 });
  });
});

// ── getStalenessTag ──────────────────────────────────────────────────

describe('getStalenessTag', () => {
  it('returns empty for fresh entry', () => {
    expect(getStalenessTag('k', { k: Date.now() })).toBe('');
  });

  it('returns day count for stale entry', () => {
    const old = Date.now() - 60 * 86400000;
    const tag = getStalenessTag('k', { k: old });
    expect(tag).toMatch(/^\s\[60d\]$/);
  });

  it('returns [untracked] for missing entry', () => {
    expect(getStalenessTag('k', {})).toBe(' [untracked]');
  });

  it('reports correct day count at various ages', () => {
    for (const days of [31, 45, 90, 365]) {
      const ts = Date.now() - days * 86400000;
      const tag = getStalenessTag('k', { k: ts });
      expect(tag).toBe(` [${days}d]`);
    }
  });
});

// ── Migration ────────────────────────────────────────────────────────

describe('migration from legacy formats', () => {
  it('migrates separate entries.json + aliases.json + confirm.json', () => {
    // Create legacy files
    fs.writeFileSync(path.join(tmpDir, 'entries.json'), JSON.stringify({ project: { name: 'test' } }));
    fs.writeFileSync(path.join(tmpDir, 'aliases.json'), JSON.stringify({ a: 'b.c' }));
    fs.writeFileSync(path.join(tmpDir, 'confirm.json'), JSON.stringify({ cmd: true }));
    clearStoreCaches();

    // Access triggers migration
    const entries = loadEntries('global');
    expect(entries).toEqual({ project: { name: 'test' } });

    // Verify unified file was created
    const raw = readData();
    expect(raw.entries).toEqual({ project: { name: 'test' } });
    expect(raw.aliases).toEqual({ a: 'b.c' });
    expect(raw.confirm).toEqual({ cmd: true });

    // Old files should be renamed to .backup
    expect(fs.existsSync(path.join(tmpDir, 'entries.json.backup'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'aliases.json.backup'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'confirm.json.backup'))).toBe(true);
  });

  it('migrates legacy data.json (entries-only, no "entries" wrapper)', () => {
    // Legacy data.json had flat entries without the { entries: ... } wrapper
    fs.writeFileSync(dataPath, JSON.stringify({ project: { name: 'legacy' } }));
    clearStoreCaches();

    const entries = loadEntries('global');
    expect(entries).toEqual({ project: { name: 'legacy' } });

    // After migration the file should have the new format
    clearStoreCaches();
    const raw = readData();
    expect(raw.entries).toBeDefined();
  });

  it('skips migration when unified file already exists in new format', () => {
    writeData({ entries: { x: '1' }, aliases: {}, confirm: {} });
    clearStoreCaches();

    const entries = loadEntries('global');
    expect(entries).toEqual({ x: '1' });
    // No backup files should exist
    expect(fs.existsSync(path.join(tmpDir, 'data.json.backup'))).toBe(false);
  });

  it('handles fresh install with no files at all', () => {
    clearStoreCaches();
    const entries = loadEntries('global');
    expect(entries).toEqual({});
  });

  it('migrates old data.json when entries.json does not exist', () => {
    const oldDataPath = path.join(tmpDir, 'data.json');
    fs.writeFileSync(oldDataPath, JSON.stringify({ old: 'data' }));
    clearStoreCaches();

    loadEntries('global');

    // The file should now be in unified format
    const raw = readData();
    expect(raw.entries).toBeDefined();
    // And the old file is backed up (it is data.json itself, so check format)
  });
});

// ── Constants ────────────────────────────────────────────────────────

describe('constants', () => {
  it('STALE_DAYS is 30', () => {
    expect(STALE_DAYS).toBe(30);
  });

  it('STALE_MS equals STALE_DAYS * 86400000', () => {
    expect(STALE_MS).toBe(STALE_DAYS * 86400000);
  });
});
