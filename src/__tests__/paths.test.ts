import fs from 'fs';
import path from 'path';
import os from 'os';

// We need to test paths module in isolation — import dynamically after setting env
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-paths-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('paths utilities', () => {
  // Since paths.ts uses module-level caching, we need fresh imports per test.
  // Use vi.resetModules() and dynamic import.

  describe('getDataDirectory', () => {
    it('returns CODEX_DATA_DIR when set', async () => {
      // CODEX_DATA_DIR is set by vitest.config.ts, so it should be respected
      expect(process.env.CODEX_DATA_DIR).toBeDefined();
      vi.resetModules();
      const { getDataDirectory } = await import('../utils/paths');
      expect(getDataDirectory()).toBe(process.env.CODEX_DATA_DIR);
    });
  });

  describe('ensureDataDirectoryExists', () => {
    it('creates directory if it does not exist', async () => {
      const newDir = path.join(tmpDir, 'new-data-dir');
      vi.resetModules();
      const originalEnv = process.env.CODEX_DATA_DIR;
      process.env.CODEX_DATA_DIR = newDir;

      try {
        const { ensureDataDirectoryExists } = await import('../utils/paths');
        ensureDataDirectoryExists();
        expect(fs.existsSync(newDir)).toBe(true);
      } finally {
        process.env.CODEX_DATA_DIR = originalEnv;
      }
    });
  });

  describe('findProjectFile', () => {
    it('returns null when CODEX_NO_PROJECT is set', async () => {
      vi.resetModules();
      const originalNoProject = process.env.CODEX_NO_PROJECT;
      process.env.CODEX_NO_PROJECT = '1';

      try {
        const { findProjectFile, clearProjectFileCache } = await import('../utils/paths');
        clearProjectFileCache();
        expect(findProjectFile()).toBeNull();
      } finally {
        if (originalNoProject !== undefined) {
          process.env.CODEX_NO_PROJECT = originalNoProject;
        } else {
          delete process.env.CODEX_NO_PROJECT;
        }
      }
    });

    it('caches result after first call', async () => {
      vi.resetModules();
      const originalNoProject = process.env.CODEX_NO_PROJECT;
      process.env.CODEX_NO_PROJECT = '1';

      try {
        const { findProjectFile, clearProjectFileCache } = await import('../utils/paths');
        clearProjectFileCache();
        const first = findProjectFile();
        const second = findProjectFile();
        expect(first).toBe(second);
      } finally {
        if (originalNoProject !== undefined) {
          process.env.CODEX_NO_PROJECT = originalNoProject;
        } else {
          delete process.env.CODEX_NO_PROJECT;
        }
      }
    });

    it('clearProjectFileCache resets the cache', async () => {
      vi.resetModules();
      process.env.CODEX_NO_PROJECT = '1';

      try {
        const { findProjectFile, clearProjectFileCache } = await import('../utils/paths');
        clearProjectFileCache();
        findProjectFile(); // populate cache
        clearProjectFileCache(); // clear
        // After clear, it should search again
        const result = findProjectFile();
        expect(result).toBeNull(); // still null because CODEX_NO_PROJECT
      } finally {
        delete process.env.CODEX_NO_PROJECT;
      }
    });
  });

  describe('file path getters', () => {
    it('getAliasFilePath returns path inside data directory', async () => {
      vi.resetModules();
      const { getAliasFilePath, getDataDirectory } = await import('../utils/paths');
      expect(getAliasFilePath()).toBe(path.join(getDataDirectory(), 'aliases.json'));
    });

    it('getConfigFilePath returns path inside data directory', async () => {
      vi.resetModules();
      const { getConfigFilePath, getDataDirectory } = await import('../utils/paths');
      expect(getConfigFilePath()).toBe(path.join(getDataDirectory(), 'config.json'));
    });

    it('getConfirmFilePath returns path inside data directory', async () => {
      vi.resetModules();
      const { getConfirmFilePath, getDataDirectory } = await import('../utils/paths');
      expect(getConfirmFilePath()).toBe(path.join(getDataDirectory(), 'confirm.json'));
    });

    it('getUnifiedDataFilePath returns data.json inside data directory', async () => {
      vi.resetModules();
      const { getUnifiedDataFilePath, getDataDirectory } = await import('../utils/paths');
      expect(getUnifiedDataFilePath()).toBe(path.join(getDataDirectory(), 'data.json'));
    });
  });
});
