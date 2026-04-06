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

import { loadMeta, touchMeta, removeMeta, loadEntries, saveEntries, clearStoreCaches, getStalenessTag, STALE_DAYS } from '../store';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-meta-'));
  dataPath = path.join(tmpDir, 'data.json');
  clearStoreCaches();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('store meta operations', () => {
  it('touchMeta writes a timestamp for the key', () => {
    fs.writeFileSync(dataPath, JSON.stringify({ entries: { foo: 'bar' }, aliases: {}, confirm: {} }));
    clearStoreCaches();

    touchMeta('foo', 'global');

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Record<string, unknown>;
    const meta = data._meta as Record<string, number>;
    expect(meta.foo).toBeGreaterThan(0);
  });

  it('loadMeta returns stored timestamps', () => {
    const now = Date.now();
    fs.writeFileSync(dataPath, JSON.stringify({
      entries: { foo: 'bar' },
      aliases: {},
      confirm: {},
      _meta: { foo: now },
    }));
    clearStoreCaches();

    const meta = loadMeta('global');
    expect(meta.foo).toBe(now);
  });

  it('loadMeta returns empty object when no _meta exists', () => {
    fs.writeFileSync(dataPath, JSON.stringify({ entries: {}, aliases: {}, confirm: {} }));
    clearStoreCaches();

    const meta = loadMeta('global');
    expect(meta).toEqual({});
  });

  it('removeMeta deletes key and children', () => {
    fs.writeFileSync(dataPath, JSON.stringify({
      entries: {},
      aliases: {},
      confirm: {},
      _meta: { 'server': 100, 'server.ip': 200, 'server.port': 300, 'other': 400 },
    }));
    clearStoreCaches();

    removeMeta('server', 'global');

    const meta = loadMeta('global');
    expect(meta.server).toBeUndefined();
    expect(meta['server.ip']).toBeUndefined();
    expect(meta['server.port']).toBeUndefined();
    expect(meta.other).toBe(400);
  });

  it('_meta is preserved through save/load cycle', () => {
    const now = Date.now();
    fs.writeFileSync(dataPath, JSON.stringify({
      entries: { foo: 'bar' },
      aliases: {},
      confirm: {},
      _meta: { foo: now },
    }));
    clearStoreCaches();

    const entries = loadEntries('global');
    entries.baz = 'qux';
    saveEntries(entries, 'global');

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Record<string, unknown>;
    expect((data._meta as Record<string, number>).foo).toBe(now);
  });

  it('_meta is not written when empty', () => {
    fs.writeFileSync(dataPath, JSON.stringify({ entries: { foo: 'bar' }, aliases: {}, confirm: {} }));
    clearStoreCaches();

    saveEntries({ foo: 'baz' } as Record<string, unknown>, 'global');

    const raw = fs.readFileSync(dataPath, 'utf8');
    expect(raw).not.toContain('_meta');
  });
});

describe('getStalenessTag', () => {
  it('returns empty string for fresh entries', () => {
    expect(getStalenessTag('k', { k: Date.now() })).toBe('');
  });

  it('returns age tag for stale entries', () => {
    const old = Date.now() - 45 * 86400000;
    expect(getStalenessTag('k', { k: old })).toBe(' [45d]');
  });

  it('returns [untracked] for missing entries', () => {
    expect(getStalenessTag('k', {})).toBe(' [untracked]');
  });

  it('returns empty for entry exactly at threshold', () => {
    const atThreshold = Date.now() - STALE_DAYS * 86400000;
    // At exactly the threshold, ts < cutoff is false (equal), so fresh
    expect(getStalenessTag('k', { k: atThreshold })).toBe('');
  });

  it('returns tag for entry one day past threshold', () => {
    const pastThreshold = Date.now() - (STALE_DAYS + 1) * 86400000;
    const tag = getStalenessTag('k', { k: pastThreshold });
    expect(tag).toMatch(/^ \[\d+d\]$/);
  });
});
