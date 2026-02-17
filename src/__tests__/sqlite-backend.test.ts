import fs from 'fs';
import path from 'path';
import os from 'os';

// Skip entire suite if better-sqlite3 can't be loaded (native module mismatch, not installed, etc.)
let sqliteAvailable = false;
try {
  const Sqlite3 = require('better-sqlite3');
  // Instantiate an in-memory DB to verify the native binary actually loads
  const testDb = new Sqlite3(':memory:');
  testDb.close();
  sqliteAvailable = true;
} catch {
  // native module not loadable
}

import {
  loadDataSqlite,
  saveDataSqlite,
  loadAliasesSqlite,
  saveAliasesSqlite,
  closeSqlite,
  isSqliteAvailable,
  getSubtreeSqlite,
  setEntrySqlite,
  removeEntrySqlite,
  getEntriesFlatSqlite
} from '../sqlite-backend';

// Use a temp directory for each test run
let tmpDir: string;

jest.mock('../utils/paths', () => ({
  getDbFilePath: () => path.join(tmpDir, 'codexcli.db'),
  ensureDataDirectoryExists: () => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  }
}));

(sqliteAvailable ? describe : describe.skip)('sqlite-backend', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sqlite-test-'));
    closeSqlite();
  });

  afterEach(() => {
    closeSqlite();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('isSqliteAvailable', () => {
    it('returns true when better-sqlite3 is installed', () => {
      expect(isSqliteAvailable()).toBe(true);
    });
  });

  describe('data round-trip', () => {
    it('returns empty object from fresh database', () => {
      const data = loadDataSqlite();
      expect(data).toEqual({});
    });

    it('saves and loads simple data', () => {
      saveDataSqlite({ hello: 'world' });
      const data = loadDataSqlite();
      expect(data).toEqual({ hello: 'world' });
    });

    it('preserves nested/hierarchical data', () => {
      const nested = {
        server: {
          production: {
            ip: '192.168.1.100',
            port: '22'
          },
          staging: {
            ip: '10.0.0.1'
          }
        },
        simple: 'value'
      };
      saveDataSqlite(nested);
      const data = loadDataSqlite();
      expect(data).toEqual(nested);
    });

    it('overwrites previous data on save', () => {
      saveDataSqlite({ first: 'value' });
      saveDataSqlite({ second: 'value' });
      const data = loadDataSqlite();
      expect(data).toEqual({ second: 'value' });
    });
  });

  describe('normalized schema', () => {
    it('stores each leaf value as a separate row', () => {
      saveDataSqlite({
        server: { ip: '1.2.3.4', port: '22' },
        name: 'test'
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const BetterSqlite3 = require('better-sqlite3');
      const db = new BetterSqlite3(path.join(tmpDir, 'codexcli.db'));
      const rows = db.prepare('SELECT key, value FROM entries ORDER BY key').all();
      db.close();

      expect(rows).toEqual([
        { key: 'name', value: 'test' },
        { key: 'server.ip', value: '1.2.3.4' },
        { key: 'server.port', value: '22' }
      ]);
    });

    it('stores each alias as a separate row', () => {
      saveAliasesSqlite({ prodip: 'server.ip', devip: 'server.dev.ip' });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const BetterSqlite3 = require('better-sqlite3');
      const db = new BetterSqlite3(path.join(tmpDir, 'codexcli.db'));
      const rows = db.prepare('SELECT name, target FROM aliases ORDER BY name').all();
      db.close();

      expect(rows).toEqual([
        { name: 'devip', target: 'server.dev.ip' },
        { name: 'prodip', target: 'server.ip' }
      ]);
    });
  });

  describe('legacy migration', () => {
    it('migrates data from old singleton-blob schema on first connect', () => {
      // Manually create the old schema
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const BetterSqlite3 = require('better-sqlite3');
      const dbPath = path.join(tmpDir, 'codexcli.db');
      const db = new BetterSqlite3(dbPath);

      db.exec(`
        CREATE TABLE data_store (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL DEFAULT '{}');
        CREATE TABLE alias_store (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL DEFAULT '{}');
        INSERT INTO data_store (id, data) VALUES (1, '{"server":{"ip":"1.2.3.4"}}');
        INSERT INTO alias_store (id, data) VALUES (1, '{"prodip":"server.ip"}');
      `);
      db.close();

      // Opening via the backend should auto-migrate
      const data = loadDataSqlite();
      const aliases = loadAliasesSqlite();

      expect(data).toEqual({ server: { ip: '1.2.3.4' } });
      expect(aliases).toEqual({ prodip: 'server.ip' });
    });

    it('drops legacy tables after migration', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const BetterSqlite3 = require('better-sqlite3');
      const dbPath = path.join(tmpDir, 'codexcli.db');
      const db = new BetterSqlite3(dbPath);

      db.exec(`
        CREATE TABLE data_store (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL DEFAULT '{}');
        CREATE TABLE alias_store (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL DEFAULT '{}');
        INSERT INTO data_store (id, data) VALUES (1, '{}');
        INSERT INTO alias_store (id, data) VALUES (1, '{}');
      `);
      db.close();

      // Trigger migration
      loadDataSqlite();
      closeSqlite();

      // Verify legacy tables are gone
      const db2 = new BetterSqlite3(dbPath);
      const tables = db2.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('data_store','alias_store')"
      ).all();
      db2.close();

      expect(tables).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('loadDataSqlite returns {} and logs error on corrupted database', () => {
      // Write garbage to the database file
      fs.writeFileSync(path.join(tmpDir, 'codexcli.db'), 'not a database');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const data = loadDataSqlite();
      expect(data).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('loadAliasesSqlite returns {} and logs error on corrupted database', () => {
      fs.writeFileSync(path.join(tmpDir, 'codexcli.db'), 'not a database');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const aliases = loadAliasesSqlite();
      expect(aliases).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('alias round-trip', () => {
    it('returns empty object from fresh database', () => {
      const aliases = loadAliasesSqlite();
      expect(aliases).toEqual({});
    });

    it('saves and loads aliases', () => {
      const aliases = { prodip: 'server.production.ip', devip: 'server.dev.ip' };
      saveAliasesSqlite(aliases);
      const loaded = loadAliasesSqlite();
      expect(loaded).toEqual(aliases);
    });
  });

  describe('getSubtreeSqlite', () => {
    it('returns undefined for a missing key', () => {
      expect(getSubtreeSqlite('nope')).toBeUndefined();
    });

    it('returns a leaf string value', () => {
      saveDataSqlite({ server: { ip: '1.2.3.4' } });
      expect(getSubtreeSqlite('server.ip')).toBe('1.2.3.4');
    });

    it('returns a reconstructed subtree', () => {
      saveDataSqlite({ server: { prod: { ip: '1.2.3.4', port: '22' }, dev: { ip: '10.0.0.1' } } });
      expect(getSubtreeSqlite('server.prod')).toEqual({ ip: '1.2.3.4', port: '22' });
    });

    it('returns the full subtree for a top-level key', () => {
      saveDataSqlite({ server: { ip: '1.2.3.4' }, name: 'test' });
      expect(getSubtreeSqlite('server')).toEqual({ ip: '1.2.3.4' });
    });
  });

  describe('setEntrySqlite', () => {
    it('sets a new leaf value', () => {
      setEntrySqlite('server.ip', '1.2.3.4');
      expect(getSubtreeSqlite('server.ip')).toBe('1.2.3.4');
    });

    it('overwrites an existing leaf', () => {
      setEntrySqlite('server.ip', '1.1.1.1');
      setEntrySqlite('server.ip', '2.2.2.2');
      expect(getSubtreeSqlite('server.ip')).toBe('2.2.2.2');
    });

    it('replaces a subtree with a leaf', () => {
      saveDataSqlite({ server: { prod: { ip: '1.2.3.4', port: '22' } } });
      setEntrySqlite('server.prod', 'flat-value');
      expect(getSubtreeSqlite('server.prod')).toBe('flat-value');
      expect(getSubtreeSqlite('server.prod.ip')).toBeUndefined();
    });

    it('clears conflicting parent leaves', () => {
      setEntrySqlite('server', 'leaf');
      setEntrySqlite('server.ip', '1.2.3.4');
      // 'server' should no longer be a leaf — it's now a branch
      expect(getSubtreeSqlite('server')).toEqual({ ip: '1.2.3.4' });
    });
  });

  describe('removeEntrySqlite', () => {
    it('returns false for a missing key', () => {
      expect(removeEntrySqlite('nope')).toBe(false);
    });

    it('removes a single leaf', () => {
      saveDataSqlite({ a: 'one', b: 'two' });
      expect(removeEntrySqlite('a')).toBe(true);
      expect(getSubtreeSqlite('a')).toBeUndefined();
      expect(getSubtreeSqlite('b')).toBe('two');
    });

    it('removes a subtree and all children', () => {
      saveDataSqlite({ server: { prod: { ip: '1.2.3.4', port: '22' } } });
      expect(removeEntrySqlite('server')).toBe(true);
      expect(getSubtreeSqlite('server')).toBeUndefined();
      expect(getSubtreeSqlite('server.prod.ip')).toBeUndefined();
    });
  });

  describe('getEntriesFlatSqlite', () => {
    it('returns empty object for fresh database', () => {
      expect(getEntriesFlatSqlite()).toEqual({});
    });

    it('returns flat dot-path entries', () => {
      saveDataSqlite({ server: { ip: '1.2.3.4' }, name: 'test' });
      const flat = getEntriesFlatSqlite();
      expect(flat).toEqual({ 'server.ip': '1.2.3.4', 'name': 'test' });
    });
  });

  describe('closeSqlite', () => {
    it('is safe to call multiple times', () => {
      loadDataSqlite(); // opens db
      closeSqlite();
      closeSqlite();
      closeSqlite();
      // No errors thrown
    });

    it('allows re-opening after close', () => {
      saveDataSqlite({ test: 'value' });
      closeSqlite();
      const data = loadDataSqlite();
      expect(data).toEqual({ test: 'value' });
    });
  });
});
