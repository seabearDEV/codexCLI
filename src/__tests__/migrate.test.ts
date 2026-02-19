import fs from 'fs';
import path from 'path';
import os from 'os';

// Skip entire suite if better-sqlite3 can't be loaded (native module mismatch, not installed, etc.)
let sqliteAvailable = false;
try {
  const Sqlite3 = (await import('better-sqlite3')).default;
  // Instantiate an in-memory DB to verify the native binary actually loads
  const testDb = new Sqlite3(':memory:');
  testDb.close();
  sqliteAvailable = true;
} catch {
  // native module not loadable
}

// Use a temp directory for each test run
let tmpDir: string;

vi.mock('../utils/paths', () => ({
  getDataDirectory: () => tmpDir,
  getDataFilePath: () => path.join(tmpDir, 'data.json'),
  getAliasFilePath: () => path.join(tmpDir, 'aliases.json'),
  getConfigFilePath: () => path.join(tmpDir, 'config.json'),
  getDbFilePath: () => path.join(tmpDir, 'codexcli.db'),
  ensureDataDirectoryExists: () => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  }
}));

// Clear all module caches so config reads from the temp dir
beforeEach(() => {
  vi.resetModules();
});

function setupTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-migrate-test-'));
}

function teardownTmpDir() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function writeJsonConfig(config: Record<string, unknown>) {
  fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

function readJsonConfig(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf8'));
}

(sqliteAvailable ? describe : describe.skip)('migrate', () => {
  beforeEach(() => {
    setupTmpDir();
  });

  afterEach(async () => {
    // Close any open sqlite connection
    try {
      const { closeSqlite } = await import('../sqlite-backend');
      closeSqlite();
    } catch { /* ok */ }
    teardownTmpDir();
  });

  describe('migrateToSqlite', () => {
    it('migrates JSON data and aliases to SQLite', async () => {
      const testData = { server: { ip: '1.2.3.4' } };
      const testAliases = { prodip: 'server.ip' };
      fs.writeFileSync(path.join(tmpDir, 'data.json'), JSON.stringify(testData), 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'aliases.json'), JSON.stringify(testAliases), 'utf8');
      writeJsonConfig({ colors: true, theme: 'default', backend: 'json' });

      const { migrateToSqlite } = await import('../commands/migrate');
      migrateToSqlite();

      // Verify config was updated
      const config = readJsonConfig();
      expect(config.backend).toBe('sqlite');

      // Verify data is in SQLite
      const { loadDataSqlite, loadAliasesSqlite } = await import('../sqlite-backend');
      expect(loadDataSqlite()).toEqual(testData);
      expect(loadAliasesSqlite()).toEqual(testAliases);

      // Verify original JSON files still exist (backups)
      expect(fs.existsSync(path.join(tmpDir, 'data.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'aliases.json'))).toBe(true);
    });

    it('skips migration if already on sqlite without --force', async () => {
      writeJsonConfig({ colors: true, theme: 'default', backend: 'sqlite' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation();

      const { migrateToSqlite } = await import('../commands/migrate');
      migrateToSqlite();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already set to "sqlite"'));
      consoleSpy.mockRestore();
    });

    it('allows re-migration with --force', async () => {
      const testData = { key: 'value' };
      fs.writeFileSync(path.join(tmpDir, 'data.json'), JSON.stringify(testData), 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'aliases.json'), '{}', 'utf8');
      writeJsonConfig({ colors: true, theme: 'default', backend: 'sqlite' });

      const { migrateToSqlite } = await import('../commands/migrate');
      migrateToSqlite({ force: true });

      const config = readJsonConfig();
      expect(config.backend).toBe('sqlite');

      const { loadDataSqlite } = await import('../sqlite-backend');
      expect(loadDataSqlite()).toEqual(testData);
    });
  });

  describe('migrateToJson', () => {
    it('migrates SQLite data and aliases to JSON', async () => {
      writeJsonConfig({ colors: true, theme: 'default', backend: 'sqlite' });

      // Seed SQLite with data
      const { saveDataSqlite, saveAliasesSqlite } = await import('../sqlite-backend');
      const testData = { server: { ip: '10.0.0.1' } };
      const testAliases = { devip: 'server.ip' };
      saveDataSqlite(testData);
      saveAliasesSqlite(testAliases);

      const { migrateToJson } = await import('../commands/migrate');
      migrateToJson();

      // Verify config was updated
      const config = readJsonConfig();
      expect(config.backend).toBe('json');

      // Verify JSON files contain the data
      const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'data.json'), 'utf8'));
      const aliases = JSON.parse(fs.readFileSync(path.join(tmpDir, 'aliases.json'), 'utf8'));
      expect(data).toEqual(testData);
      expect(aliases).toEqual(testAliases);
    });

    it('skips migration if already on json without --force', async () => {
      writeJsonConfig({ colors: true, theme: 'default', backend: 'json' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation();

      const { migrateToJson } = await import('../commands/migrate');
      migrateToJson();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already set to "json"'));
      consoleSpy.mockRestore();
    });

    it('preserves SQLite database file as backup', async () => {
      writeJsonConfig({ colors: true, theme: 'default', backend: 'sqlite' });

      const { saveDataSqlite, saveAliasesSqlite } = await import('../sqlite-backend');
      saveDataSqlite({ key: 'val' });
      saveAliasesSqlite({});

      const { migrateToJson } = await import('../commands/migrate');
      migrateToJson();

      expect(fs.existsSync(path.join(tmpDir, 'codexcli.db'))).toBe(true);
    });
  });
});
