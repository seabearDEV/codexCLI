import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

// Mock getDataDirectory to point at our temp dir (avoids path caching issues)
vi.mock('../utils/paths', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../utils/paths')>();
  return {
    ...orig,
    getDataDirectory: () => tmpDir,
  };
});

// Import after mocks
import { logToolCall, loadTelemetry, computeStats, TelemetryEntry } from '../utils/telemetry';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-telemetry-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('logToolCall', () => {
  it('creates telemetry.jsonl and writes a valid entry', () => {
    logToolCall('codex_get', 'arch.mcp');
    const content = fs.readFileSync(path.join(tmpDir, 'telemetry.jsonl'), 'utf8');
    const entry = JSON.parse(content.trim()) as TelemetryEntry;
    expect(entry.tool).toBe('codex_get');
    expect(entry.op).toBe('read');
    expect(entry.ns).toBe('arch');
    expect(entry.session).toMatch(/^[a-f0-9]{8}$/);
    expect(entry.ts).toBeGreaterThan(0);
  });

  it('appends multiple entries', () => {
    logToolCall('codex_set', 'project.name');
    logToolCall('codex_get', 'project.name');
    const entries = loadTelemetry();
    expect(entries).toHaveLength(2);
  });

  it('classifies writes correctly', () => {
    logToolCall('codex_set', 'x');
    logToolCall('codex_remove', 'x');
    logToolCall('codex_copy', 'x');
    logToolCall('codex_import');
    logToolCall('codex_reset');
    logToolCall('codex_alias_set', 'a');
    logToolCall('codex_alias_remove', 'a');
    logToolCall('codex_config_set');
    logToolCall('codex_rename', 'x');
    const entries = loadTelemetry();
    expect(entries.every(e => e.op === 'write')).toBe(true);
  });

  it('classifies reads correctly', () => {
    logToolCall('codex_get', 'x');
    logToolCall('codex_context');
    logToolCall('codex_search', 'term');
    logToolCall('codex_export');
    logToolCall('codex_alias_list');
    logToolCall('codex_config_get');
    const entries = loadTelemetry();
    expect(entries.every(e => e.op === 'read')).toBe(true);
  });

  it('classifies exec correctly', () => {
    logToolCall('codex_run', 'cmd');
    const entries = loadTelemetry();
    expect(entries[0].op).toBe('exec');
  });

  it('extracts top-level namespace from dot-notation key', () => {
    logToolCall('codex_get', 'arch.mcp.tools');
    const entries = loadTelemetry();
    expect(entries[0].ns).toBe('arch');
  });

  it('uses * for missing key', () => {
    logToolCall('codex_context');
    const entries = loadTelemetry();
    expect(entries[0].ns).toBe('*');
  });

  it('uses full key when no dots', () => {
    logToolCall('codex_get', 'toplevel');
    const entries = loadTelemetry();
    expect(entries[0].ns).toBe('toplevel');
  });
});

describe('loadTelemetry', () => {
  it('returns empty array when no file exists', () => {
    expect(loadTelemetry()).toEqual([]);
  });

  it('skips malformed lines', () => {
    const telemetryPath = path.join(tmpDir, 'telemetry.jsonl');
    fs.writeFileSync(telemetryPath, '{"ts":1,"tool":"a","session":"x","op":"read","ns":"*"}\nnot json\n{"ts":2,"tool":"b","session":"x","op":"write","ns":"y"}\n');
    const entries = loadTelemetry();
    expect(entries).toHaveLength(2);
    expect(entries[0].tool).toBe('a');
    expect(entries[1].tool).toBe('b');
  });
});

describe('computeStats', () => {
  function writeEntries(entries: TelemetryEntry[]) {
    const telemetryPath = path.join(tmpDir, 'telemetry.jsonl');
    const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(telemetryPath, lines);
  }

  it('returns zero stats when no data', () => {
    const stats = computeStats();
    expect(stats.totalCalls).toBe(0);
    expect(stats.totalSessions).toBe(0);
  });

  it('computes bootstrap rate correctly', () => {
    const now = Date.now();
    writeEntries([
      // Session 1: bootstrapped (context first)
      { ts: now - 100, tool: 'codex_context', session: 's1', op: 'read', ns: '*' },
      { ts: now - 90, tool: 'codex_get', session: 's1', op: 'read', ns: 'arch' },
      // Session 2: not bootstrapped (get first)
      { ts: now - 80, tool: 'codex_get', session: 's2', op: 'read', ns: 'arch' },
      { ts: now - 70, tool: 'codex_context', session: 's2', op: 'read', ns: '*' },
    ]);
    const stats = computeStats();
    expect(stats.totalSessions).toBe(2);
    expect(stats.bootstrapRate).toBe(0.5);
  });

  it('computes write-back rate correctly', () => {
    const now = Date.now();
    writeEntries([
      // Session 1: wrote back
      { ts: now - 100, tool: 'codex_context', session: 's1', op: 'read', ns: '*' },
      { ts: now - 90, tool: 'codex_set', session: 's1', op: 'write', ns: 'arch' },
      // Session 2: read only
      { ts: now - 80, tool: 'codex_context', session: 's2', op: 'read', ns: '*' },
      { ts: now - 70, tool: 'codex_get', session: 's2', op: 'read', ns: 'arch' },
    ]);
    const stats = computeStats();
    expect(stats.writeBackRate).toBe(0.5);
  });

  it('computes read:write ratio', () => {
    const now = Date.now();
    writeEntries([
      { ts: now - 100, tool: 'codex_get', session: 's1', op: 'read', ns: 'a' },
      { ts: now - 90, tool: 'codex_get', session: 's1', op: 'read', ns: 'b' },
      { ts: now - 80, tool: 'codex_get', session: 's1', op: 'read', ns: 'c' },
      { ts: now - 70, tool: 'codex_set', session: 's1', op: 'write', ns: 'a' },
    ]);
    const stats = computeStats();
    expect(stats.reads).toBe(3);
    expect(stats.writes).toBe(1);
    expect(stats.readWriteRatio).toBe('3.0:1');
  });

  it('tracks namespace coverage', () => {
    const now = Date.now();
    writeEntries([
      { ts: now - 100, tool: 'codex_get', session: 's1', op: 'read', ns: 'arch' },
      { ts: now - 90, tool: 'codex_set', session: 's1', op: 'write', ns: 'arch' },
      { ts: now - 80, tool: 'codex_get', session: 's1', op: 'read', ns: 'commands' },
    ]);
    const stats = computeStats();
    expect(stats.namespaceCoverage.arch).toEqual({ reads: 1, writes: 1, lastWrite: now - 90 });
    expect(stats.namespaceCoverage.commands).toEqual({ reads: 1, writes: 0, lastWrite: undefined });
  });

  it('filters by period', () => {
    const now = Date.now();
    const day = 86400000;
    writeEntries([
      { ts: now - 60 * day, tool: 'codex_get', session: 'old', op: 'read', ns: 'a' },
      { ts: now - 1000, tool: 'codex_get', session: 'new', op: 'read', ns: 'b' },
    ]);
    const stats7d = computeStats(7);
    expect(stats7d.totalCalls).toBe(1);
    expect(stats7d.totalSessions).toBe(1);

    const statsAll = computeStats(0);
    expect(statsAll.totalCalls).toBe(2);
    expect(statsAll.totalSessions).toBe(2);
  });

  it('returns top tools sorted by count', () => {
    const now = Date.now();
    writeEntries([
      { ts: now - 100, tool: 'codex_get', session: 's1', op: 'read', ns: 'a' },
      { ts: now - 90, tool: 'codex_get', session: 's1', op: 'read', ns: 'b' },
      { ts: now - 80, tool: 'codex_set', session: 's1', op: 'write', ns: 'c' },
      { ts: now - 70, tool: 'codex_context', session: 's1', op: 'read', ns: '*' },
    ]);
    const stats = computeStats();
    expect(stats.topTools[0]).toEqual({ tool: 'codex_get', count: 2 });
  });
});
