import fs from 'fs';
import path from 'path';
import os from 'os';
import { createAutoBackup } from '../utils/autoBackup';

let tmpDir: string;

vi.mock('../utils/paths', () => ({
  getDataDirectory: () => tmpDir,
}));

vi.mock('../config', () => ({
  getConfigSetting: vi.fn((key: string) => {
    if (key === 'max_backups') return 3;
    return null;
  }),
}));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-backup-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createAutoBackup', () => {
  it('creates a backup directory with data.json copy', () => {
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{"entries":{}}');

    const result = createAutoBackup('test');

    expect(result).toBeTruthy();
    expect(fs.existsSync(result!)).toBe(true);
    expect(fs.existsSync(path.join(result!, 'data.json'))).toBe(true);
  });

  it('returns null when no files to back up', () => {
    // No data files in tmpDir
    const result = createAutoBackup('test');
    expect(result).toBeNull();
  });

  it('rotates old backups based on max_backups config', () => {
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{}');
    const backupDir = path.join(tmpDir, '.backups');

    // Create 5 existing backups
    fs.mkdirSync(backupDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      const dir = path.join(backupDir, `old-${String(i).padStart(3, '0')}`);
      fs.mkdirSync(dir);
      // Give them staggered mtimes
      const time = new Date(2020, 0, 1 + i);
      fs.utimesSync(dir, time, time);
    }

    // Create a new backup (max_backups = 3)
    createAutoBackup('new');

    const remaining = fs.readdirSync(backupDir);
    // Should keep 3 total (pruned the oldest)
    expect(remaining.length).toBe(3);
  });

  it('backs up legacy files when they exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'entries.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'aliases.json'), '{}');

    const result = createAutoBackup('legacy');

    expect(result).toBeTruthy();
    expect(fs.existsSync(path.join(result!, 'entries.json'))).toBe(true);
    expect(fs.existsSync(path.join(result!, 'aliases.json'))).toBe(true);
  });

  it('labels backup directory with the provided label', () => {
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{}');

    const result = createAutoBackup('pre-import');

    expect(result).toBeTruthy();
    expect(path.basename(result!)).toMatch(/^pre-import-/);
  });
});
