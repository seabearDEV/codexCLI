import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

vi.mock('../utils/paths', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../utils/paths')>();
  return {
    ...orig,
    getDataDirectory: () => tmpDir,
  };
});

vi.mock('../utils/crypto', () => ({
  isEncrypted: (v: string) => v.startsWith('ENC:'),
}));

import { logAudit, loadAuditLog, queryAuditLog, sanitizeValue, sanitizeParams, AuditEntry } from '../utils/audit';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-audit-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.CODEX_AGENT_NAME;
});

describe('sanitizeValue', () => {
  it('returns undefined for undefined input', () => {
    expect(sanitizeValue(undefined)).toBeUndefined();
  });

  it('returns [encrypted] for encrypted values', () => {
    expect(sanitizeValue('ENC:abc123')).toBe('[encrypted]');
  });

  it('truncates long values', () => {
    const long = 'x'.repeat(600);
    const result = sanitizeValue(long);
    expect(result).toHaveLength(500 + '...[truncated]'.length);
    expect(result).toContain('...[truncated]');
  });

  it('passes through short values unchanged', () => {
    expect(sanitizeValue('hello')).toBe('hello');
  });
});

describe('sanitizeParams', () => {
  it('redacts password field', () => {
    const result = sanitizeParams({ key: 'x', password: 'secret123' });
    expect(result.key).toBe('x');
    expect(result.password).toBe('[redacted]');
  });

  it('truncates long string values', () => {
    const long = 'y'.repeat(600);
    const result = sanitizeParams({ value: long });
    expect(typeof result.value).toBe('string');
    expect((result.value as string).length).toBeLessThan(600);
    expect((result.value as string)).toContain('...[truncated]');
  });

  it('passes through non-string values unchanged', () => {
    const result = sanitizeParams({ flag: true, count: 42 });
    expect(result.flag).toBe(true);
    expect(result.count).toBe(42);
  });
});

describe('logAudit', () => {
  it('creates audit.jsonl and writes a valid entry', async () => {
    await logAudit({
      src: 'mcp',
      tool: 'codex_set',
      op: 'write',
      key: 'arch.mcp',
      scope: 'project',
      success: true,
      before: 'old',
      after: 'new',
    });
    const content = fs.readFileSync(path.join(tmpDir, 'audit.jsonl'), 'utf8');
    const entry = JSON.parse(content.trim()) as AuditEntry;
    expect(entry.tool).toBe('codex_set');
    expect(entry.op).toBe('write');
    expect(entry.key).toBe('arch.mcp');
    expect(entry.success).toBe(true);
    expect(entry.before).toBe('old');
    expect(entry.after).toBe('new');
    expect(entry.session).toMatch(/^[a-f0-9]{8}$/);
    expect(entry.ts).toBeGreaterThan(0);
  });

  it('captures CODEX_AGENT_NAME env var', async () => {
    process.env.CODEX_AGENT_NAME = 'cursor';
    await logAudit({
      src: 'mcp',
      tool: 'codex_get',
      op: 'read',
      success: true,
    });
    const entries = loadAuditLog();
    expect(entries[0].agent).toBe('cursor');
  });

  it('leaves agent undefined when env var not set', async () => {
    await logAudit({
      src: 'cli',
      tool: 'codex_set',
      op: 'write',
      success: true,
    });
    const entries = loadAuditLog();
    expect(entries[0].agent).toBeUndefined();
  });

  it('appends multiple entries', async () => {
    await logAudit({ src: 'mcp', tool: 'codex_set', op: 'write', success: true });
    await logAudit({ src: 'cli', tool: 'codex_get', op: 'read', success: true });
    const entries = loadAuditLog();
    expect(entries).toHaveLength(2);
  });
});

describe('loadAuditLog', () => {
  it('returns empty array when no file exists', () => {
    expect(loadAuditLog()).toEqual([]);
  });

  it('skips malformed lines', () => {
    const auditPath = path.join(tmpDir, 'audit.jsonl');
    fs.writeFileSync(auditPath, [
      JSON.stringify({ ts: 1, session: 'x', src: 'mcp', tool: 'a', op: 'read', success: true }),
      'not json',
      JSON.stringify({ ts: 2, session: 'x', src: 'cli', tool: 'b', op: 'write', success: false }),
    ].join('\n') + '\n');
    const entries = loadAuditLog();
    expect(entries).toHaveLength(2);
    expect(entries[0].tool).toBe('a');
    expect(entries[1].tool).toBe('b');
  });
});

describe('queryAuditLog', () => {
  function writeEntries(entries: AuditEntry[]) {
    const auditPath = path.join(tmpDir, 'audit.jsonl');
    fs.writeFileSync(auditPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  }

  const now = Date.now();
  const day = 86400000;

  it('filters by exact key', () => {
    writeEntries([
      { ts: now, session: 's1', src: 'mcp', tool: 'codex_set', op: 'write', key: 'arch.mcp', success: true },
      { ts: now, session: 's1', src: 'mcp', tool: 'codex_set', op: 'write', key: 'project.name', success: true },
    ]);
    const result = queryAuditLog({ key: 'arch.mcp' });
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('arch.mcp');
  });

  it('filters by key prefix', () => {
    writeEntries([
      { ts: now, session: 's1', src: 'mcp', tool: 'codex_set', op: 'write', key: 'arch.mcp', success: true },
      { ts: now, session: 's1', src: 'mcp', tool: 'codex_set', op: 'write', key: 'arch.cli', success: true },
      { ts: now, session: 's1', src: 'mcp', tool: 'codex_set', op: 'write', key: 'project.name', success: true },
    ]);
    const result = queryAuditLog({ key: 'arch' });
    expect(result).toHaveLength(2);
  });

  it('filters by period', () => {
    writeEntries([
      { ts: now - 60 * day, session: 'old', src: 'mcp', tool: 'codex_set', op: 'write', success: true },
      { ts: now - 1000, session: 'new', src: 'mcp', tool: 'codex_set', op: 'write', success: true },
    ]);
    const result = queryAuditLog({ periodDays: 7 });
    expect(result).toHaveLength(1);
  });

  it('filters writes only', () => {
    writeEntries([
      { ts: now, session: 's1', src: 'mcp', tool: 'codex_set', op: 'write', success: true },
      { ts: now, session: 's1', src: 'mcp', tool: 'codex_get', op: 'read', success: true },
      { ts: now, session: 's1', src: 'mcp', tool: 'codex_run', op: 'exec', success: true },
    ]);
    const result = queryAuditLog({ writesOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0].op).toBe('write');
  });

  it('returns newest first', () => {
    writeEntries([
      { ts: now - 3000, session: 's1', src: 'mcp', tool: 'codex_set', op: 'write', key: 'first', success: true },
      { ts: now - 1000, session: 's1', src: 'mcp', tool: 'codex_set', op: 'write', key: 'second', success: true },
      { ts: now - 2000, session: 's1', src: 'mcp', tool: 'codex_set', op: 'write', key: 'middle', success: true },
    ]);
    const result = queryAuditLog({});
    expect(result[0].key).toBe('second');
    expect(result[1].key).toBe('middle');
    expect(result[2].key).toBe('first');
  });

  it('applies limit', () => {
    writeEntries(Array.from({ length: 10 }, (_, i) => ({
      ts: now - i * 1000, session: 's1', src: 'mcp' as const, tool: 'codex_set', op: 'write' as const, success: true,
    })));
    const result = queryAuditLog({ limit: 3 });
    expect(result).toHaveLength(3);
  });

  it('returns all with period 0', () => {
    writeEntries([
      { ts: now - 365 * day, session: 'old', src: 'mcp', tool: 'codex_set', op: 'write', success: true },
      { ts: now, session: 'new', src: 'mcp', tool: 'codex_set', op: 'write', success: true },
    ]);
    const result = queryAuditLog({ periodDays: 0 });
    expect(result).toHaveLength(2);
  });
});
