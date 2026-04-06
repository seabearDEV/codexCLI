/**
 * Integration tests for the enhanced `ccli init` command.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

// Resolve the CLI path relative to the project root (two levels up from __tests__)
const cliPath = path.resolve(__dirname, '..', '..', 'dist', 'index.js');

const run = (args: string, cwd?: string) => {
  return execSync(`node ${cliPath} ${args}`, {
    cwd: cwd ?? tmpDir,
    timeout: 10000,
  }).toString();
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-init-'));
  // Seed a minimal package.json so scaffold has something to detect
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
    name: 'init-test',
    description: 'Test project',
    scripts: { build: 'tsc', test: 'vitest' },
    dependencies: { express: '^4' },
    devDependencies: { vitest: '^2', typescript: '^5' },
  }));
  fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true },
  }));
  fs.mkdirSync(path.join(tmpDir, 'src/__tests__'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'src/index.ts'), '');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ccli init — full flow', () => {
  it('creates .codexcli.json with scanned entries', () => {
    const output = run('init');
    expect(output).toContain('Created:');

    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, '.codexcli.json'), 'utf8'));
    expect(data.entries.project.name).toBe('init-test');
    expect(data.entries.project.stack).toContain('Node.js');
    expect(data.entries.commands.build).toBe('npm run build');
    expect(data.entries.files.entry).toContain('src/index.ts');
    expect(data.entries.conventions.types).toContain('strict');
  });

  it('creates CLAUDE.md', () => {
    run('init');
    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('## Bootstrap');
    expect(claudeMd).toContain('codex_context');
    expect(claudeMd).toContain('codex_set');
  });

  it('seeds conventions.persistence', () => {
    run('init');
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, '.codexcli.json'), 'utf8'));
    expect(data.entries.conventions.persistence).toContain('.codexcli.json');
    expect(data.entries.conventions.persistence).toContain('CLAUDE.md');
    expect(data.entries.conventions.persistence).toContain('MEMORY.md');
  });

  it('detects deps from package.json', () => {
    run('init');
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, '.codexcli.json'), 'utf8'));
    expect(data.entries.deps.express).toContain('Express');
    expect(data.entries.deps.vitest).toContain('Vitest');
  });
});

describe('ccli init — idempotency', () => {
  it('running twice produces no duplicates', () => {
    run('init');
    const output2 = run('init');
    // Second run: .codexcli.json exists, entries exist, CLAUDE.md exists
    expect(output2).toContain('already exists');
  });

  it('second run does not modify existing entries', () => {
    run('init');
    const first = fs.readFileSync(path.join(tmpDir, '.codexcli.json'), 'utf8');

    run('init');
    const second = fs.readFileSync(path.join(tmpDir, '.codexcli.json'), 'utf8');

    // Parse and compare entries (ignoring _meta timestamps)
    const firstData = JSON.parse(first);
    const secondData = JSON.parse(second);
    delete firstData._meta;
    delete secondData._meta;
    expect(secondData).toEqual(firstData);
  });
});

describe('ccli init — flags', () => {
  it('--no-scan skips codebase analysis', () => {
    run('init --no-scan');
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, '.codexcli.json'), 'utf8'));
    // Entries should be empty (no scan)
    expect(data.entries).toEqual({});
  });

  it('--no-claude skips CLAUDE.md generation', () => {
    run('init --no-claude');
    expect(fs.existsSync(path.join(tmpDir, '.codexcli.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(false);
  });

  it('--force overwrites existing CLAUDE.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'custom content');
    run('init --force');
    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('## Bootstrap');
    expect(claudeMd).not.toContain('custom content');
  });

  it('--remove deletes .codexcli.json', () => {
    run('init'); // create it first
    expect(fs.existsSync(path.join(tmpDir, '.codexcli.json'))).toBe(true);

    run('init --remove');
    expect(fs.existsSync(path.join(tmpDir, '.codexcli.json'))).toBe(false);
  });

  it('--scaffold still works (backward compat)', () => {
    run('init --scaffold');
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, '.codexcli.json'), 'utf8'));
    expect(data.entries.project.name).toBe('init-test');
  });

  it('--dry-run previews without writing', () => {
    const output = run('init --dry-run');
    expect(output).toContain('Would scaffold');
    // Files should NOT be created
    expect(fs.existsSync(path.join(tmpDir, '.codexcli.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(false);
  });
});

describe('ccli init — empty directory', () => {
  it('creates .codexcli.json and CLAUDE.md even with no project files', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-init-empty-'));
    try {
      run('init', emptyDir);
      expect(fs.existsSync(path.join(emptyDir, '.codexcli.json'))).toBe(true);
      expect(fs.existsSync(path.join(emptyDir, 'CLAUDE.md'))).toBe(true);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
