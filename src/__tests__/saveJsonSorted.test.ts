import fs from 'fs';
import path from 'path';
import os from 'os';
import { saveJsonSorted } from '../utils/saveJsonSorted';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sjson-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('saveJsonSorted', () => {
  it('writes valid JSON with sorted top-level keys', () => {
    const target = path.join(tmpDir, 'test.json');
    saveJsonSorted(target, { z: 'last', a: 'first', m: 'middle' });

    const content = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(content);
    expect(Object.keys(parsed)).toEqual(['a', 'm', 'z']);
  });

  it('formats with 2-space indentation', () => {
    const target = path.join(tmpDir, 'test.json');
    saveJsonSorted(target, { key: 'value' });

    const content = fs.readFileSync(target, 'utf8');
    expect(content).toContain('  "key"');
  });

  it('overwrites existing file', () => {
    const target = path.join(tmpDir, 'test.json');
    saveJsonSorted(target, { old: 'data' });
    saveJsonSorted(target, { new: 'data' });

    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    expect(parsed).toEqual({ new: 'data' });
    expect(parsed.old).toBeUndefined();
  });

  it('preserves nested object values', () => {
    const target = path.join(tmpDir, 'test.json');
    const obj = { entries: { server: { ip: '1.2.3.4' } }, aliases: {} };
    saveJsonSorted(target, obj);

    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    expect(parsed.entries.server.ip).toBe('1.2.3.4');
  });

  it('uses file locking (no .lock file remains after write)', () => {
    const target = path.join(tmpDir, 'test.json');
    saveJsonSorted(target, { a: '1' });

    expect(fs.existsSync(target + '.lock')).toBe(false);
  });

  it('handles empty object', () => {
    const target = path.join(tmpDir, 'test.json');
    saveJsonSorted(target, {});

    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    expect(parsed).toEqual({});
  });
});
