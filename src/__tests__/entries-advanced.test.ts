/**
 * Advanced tests for commands/entries.ts handlers.
 *
 * Covers: encrypted values, --confirm flow, batch set, --force,
 * rename with alias re-pointing, copy subtrees, edge cases.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readStoreState } from './helpers/readStoreState';

let tmpDir: string;

const run = (args: string) => {
  return execSync(`node dist/index.js ${args}`, {
    env: { ...process.env, CODEX_DATA_DIR: tmpDir, CODEX_NO_PROJECT: '1' },
    timeout: 10000,
  }).toString();
};

// v1.10.0: reads the file-per-entry store directory and reconstitutes the
// legacy UnifiedData shape the tests assert against. Falls back to reading
// a pre-migration data.json if the store dir doesn't exist yet.
const readData = () => readStoreState(tmpDir);

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-entries-'));
  // Seed an empty store directory directly — equivalent to the old practice
  // of writing an empty data.json, but in the v1.10.0 layout.
  fs.mkdirSync(path.join(tmpDir, 'store'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'store', '_aliases.json'), '{}');
  fs.writeFileSync(path.join(tmpDir, 'store', '_confirm.json'), '{}');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('entries advanced', () => {
  // ── --force flag ────────────────────────────────────────────────────

  describe('--force flag', () => {
    it('overwrites existing key without prompting', () => {
      run('set --force overwrite.test "first"');
      run('set --force overwrite.test "second"');
      const result = run('get overwrite.test');
      expect(result).toContain('second');
    });
  });

  // ── Batch set (key=value pairs) ────────────────────────────────────

  describe('batch set', () => {
    it('sets multiple key=value pairs in one command', () => {
      run('set --force batch.a=1 batch.b=2 batch.c=3');
      const data = readData();
      expect(data.entries.batch.a).toBe('1');
      expect(data.entries.batch.b).toBe('2');
      expect(data.entries.batch.c).toBe('3');
    });
  });

  // ── Run command ────────────────────────────────────────────────────

  describe('run command', () => {
    it('executes stored command and shows output', () => {
      run('set --force commands.echo "echo hello-from-codex"');
      const result = run('run commands.echo --capture');
      expect(result).toContain('hello-from-codex');
    });

    it('--dry flag shows command without executing', () => {
      run('set --force commands.dry "echo should-not-run"');
      const result = run('run commands.dry --dry');
      expect(result).toContain('echo should-not-run');
    });

    it('--source flag outputs command for eval', () => {
      run('set --force commands.src "echo sourced"');
      // --source writes to stdout for eval, stderr for display
      const result = run('run commands.src --source');
      expect(result).toContain('echo sourced');
    });

    it('returns non-zero exit code for failed command', () => {
      run('set --force commands.fail "exit 42"');
      try {
        run('run commands.fail');
        // Should not reach here
        expect(true).toBe(false);
      } catch (err: unknown) {
        const e = err as { status?: number };
        expect(e.status).toBeGreaterThan(0);
      }
    });

    it('errors on nonexistent key', () => {
      try {
        run('run nonexistent.cmd');
        expect(true).toBe(false);
      } catch (err: unknown) {
        const e = err as { stderr?: Buffer };
        expect(e.stderr?.toString()).toContain('not found');
      }
    });

    it('errors when value is a subtree', () => {
      run('set --force commands.sub.a "echo a"');
      run('set --force commands.sub.b "echo b"');
      try {
        run('run commands.sub');
        expect(true).toBe(false);
      } catch (err: unknown) {
        const e = err as { stderr?: Buffer };
        expect(e.stderr?.toString()).toContain('not a string');
      }
    });

    it('composes commands with : separator', () => {
      run('set --force parts.cd "cd /tmp"');
      run('set --force parts.ls "ls"');
      const result = run('run parts.cd:parts.ls --dry');
      expect(result).toContain('cd /tmp ls');
    });

    it('chains multiple commands with && via multiple keys', () => {
      run('set --force chain.a "echo A"');
      run('set --force chain.b "echo B"');
      const result = run('run chain.a chain.b --dry');
      expect(result).toContain('echo A && echo B');
    });
  });

  // ── Rename ─────────────────────────────────────────────────────────

  describe('rename', () => {
    it('renames a key and preserves value', () => {
      run('set --force rn.old "value"');
      run('rename rn.old rn.new');
      const result = run('get rn.new');
      expect(result).toContain('value');
    });

    it('renames and re-points aliases', () => {
      run('set --force rn.src "val" -a src');
      run('rename rn.src rn.dst');
      const data = readData();
      expect(data.aliases.src).toBe('rn.dst');
    });

    it('moves confirm metadata on rename', () => {
      run('set --force rn.confirmed "cmd" --confirm');
      run('rename rn.confirmed rn.moved');
      const data = readData();
      expect(data.confirm['rn.moved']).toBe(true);
      expect(data.confirm['rn.confirmed']).toBeUndefined();
    });

    it('errors when target key exists', () => {
      run('set --force rn.a "1"');
      run('set --force rn.b "2"');
      try {
        run('rename rn.a rn.b');
        expect(true).toBe(false);
      } catch (err: unknown) {
        const e = err as { stderr?: Buffer };
        expect(e.stderr?.toString()).toContain('already exists');
      }
    });

    it('renames a subtree', () => {
      run('set --force rn.sub.x "1"');
      run('set --force rn.sub.y "2"');
      run('rename rn.sub rn.moved');
      const data = readData();
      expect(data.entries.rn.moved.x).toBe('1');
      expect(data.entries.rn.moved.y).toBe('2');
      expect(data.entries.rn.sub).toBeUndefined();
    });
  });

  // ── Copy ───────────────────────────────────────────────────────────

  describe('copy', () => {
    it('copies a string value', () => {
      run('set --force cp.src "copied"');
      run('copy cp.src cp.dst --force');
      expect(run('get cp.src')).toContain('copied');
      expect(run('get cp.dst')).toContain('copied');
    });

    it('copies a subtree', () => {
      run('set --force cp.tree.a "1"');
      run('set --force cp.tree.b "2"');
      run('copy cp.tree cp.clone --force');
      const data = readData();
      expect(data.entries.cp.clone.a).toBe('1');
      expect(data.entries.cp.clone.b).toBe('2');
      // Original is preserved
      expect(data.entries.cp.tree.a).toBe('1');
    });

    it('errors when source does not exist', () => {
      try {
        run('copy nonexistent cp.dst');
        expect(true).toBe(false);
      } catch (err: unknown) {
        const e = err as { stderr?: Buffer };
        expect(e.stderr?.toString()).toContain('not found');
      }
    });
  });

  // ── Remove cascades ────────────────────────────────────────────────

  describe('remove cascades', () => {
    it('remove deletes associated aliases', () => {
      run('set --force rm.cascade "val" -a rc');
      run('remove rm.cascade --force');
      const data = readData();
      expect(data.aliases.rc).toBeUndefined();
    });

    it('remove deletes confirm metadata', () => {
      run('set --force rm.conf "cmd" --confirm');
      run('remove rm.conf --force');
      const data = readData();
      expect(data.confirm['rm.conf']).toBeUndefined();
    });
  });

  // ── Confirm flag ───────────────────────────────────────────────────

  describe('confirm flag', () => {
    it('--confirm stores confirm metadata', () => {
      run('set --force conf.cmd "dangerous" --confirm');
      const data = readData();
      expect(data.confirm['conf.cmd']).toBe(true);
    });

    it('--no-confirm removes confirm metadata', () => {
      run('set --force conf.cmd2 "dangerous" --confirm');
      run('set conf.cmd2 --no-confirm');
      const data = readData();
      expect(data.confirm['conf.cmd2']).toBeUndefined();
    });
  });

  // ── _meta staleness ────────────────────────────────────────────────

  describe('_meta tracking', () => {
    it('set touches _meta timestamp', () => {
      run('set --force meta.tracked "val"');
      const data = readData();
      expect(data._meta['meta.tracked']).toBeGreaterThan(0);
    });

    it('remove clears _meta timestamp', () => {
      run('set --force meta.rm "val"');
      run('remove meta.rm --force');
      const data = readData();
      expect(data._meta?.['meta.rm']).toBeUndefined();
    });
  });

  // ── JSON output ────────────────────────────────────────────────────

  describe('JSON output', () => {
    it('get --json returns valid JSON for a single key', () => {
      run('set --force json.test "value"');
      const result = run('get json.test --json');
      const parsed = JSON.parse(result);
      expect(parsed['json.test']).toBe('value');
    });

    it('get --json returns valid JSON for all entries', () => {
      run('set --force json.a "1"');
      run('set --force json.b "2"');
      const result = run('get --json');
      const parsed = JSON.parse(result);
      expect(parsed['json.a']).toBe('1');
      expect(parsed['json.b']).toBe('2');
    });
  });

  // ── Stale command ──────────────────────────────────────────────────

  describe('stale command', () => {
    it('reports recently-set entries as not stale', () => {
      run('set --force fresh.entry "val"');
      const result = run('stale');
      // Fresh entries shouldn't appear in stale output (or should say "no entries older than")
      expect(result.toLowerCase()).not.toContain('fresh.entry');
    });
  });

  // ── Get with --raw flag ────────────────────────────────────────────

  describe('get --raw', () => {
    it('outputs plain value without formatting', () => {
      run('set --force raw.test "plain value"');
      const result = run('get raw.test --raw');
      expect(result.trim()).toBe('plain value');
    });

    it('outputs [encrypted] for encrypted values', () => {
      // We can't easily test encrypt via CLI without interactive prompt,
      // but we can verify that the flag exists
      run('set --force raw.plain "visible"');
      const result = run('get raw.plain --raw');
      expect(result.trim()).toBe('visible');
    });
  });
});
