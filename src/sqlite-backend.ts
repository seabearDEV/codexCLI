import { getDbFilePath, ensureDataDirectoryExists } from './utils/paths';
import { CodexData, CodexValue } from './types';
import { color } from './formatting';
import { loadConfig } from './config';
import { flattenObject, setNestedValue } from './utils/objectPath';
// Minimal type definitions for better-sqlite3 so the file compiles
// even when the optional dependency is not installed.
interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}
interface SqliteStatement {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface SqliteDatabase {
  pragma(source: string): unknown;
  exec(source: string): this;
  prepare(source: string): SqliteStatement;
  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
  close(): void;
}

let db: SqliteDatabase | null = null;
let sqliteWarningShown = false;

/**
 * Check if SQLite backend should be used based on config and availability.
 */
export function useSqlite(): boolean {
  try {
    if (loadConfig().backend !== 'sqlite') return false;
  } catch {
    return false;
  }

  try {
    require.resolve('better-sqlite3');
    return true;
  } catch {
    if (!sqliteWarningShown) {
      sqliteWarningShown = true;
      console.error(color.yellow('Warning: backend is set to "sqlite" but better-sqlite3 is not installed. Falling back to JSON.'));
    }
    return false;
  }
}

/**
 * Check if better-sqlite3 is available at runtime
 */
export function isSqliteAvailable(): boolean {
  try {
    require.resolve('better-sqlite3');
    return true;
  } catch {
    return false;
  }
}

/**
 * Lazy-initialize and return the database connection
 */
function getDb(): SqliteDatabase {
  if (db) return db;

  ensureDataDirectoryExists();
  const dbPath = getDbFilePath();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require('better-sqlite3');
  db = new BetterSqlite3(dbPath) as SqliteDatabase;

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');  // safe with WAL; avoids fsync on every commit
  db.pragma('temp_store = MEMORY');   // keep temp tables in RAM

  // Create normalized tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS aliases (
      name TEXT PRIMARY KEY,
      target TEXT NOT NULL
    );
  `);

  // Migrate from legacy singleton-blob tables if they exist
  migrateLegacyTables(db);

  return db;
}

/**
 * One-time migration from the old single-row JSON-blob schema
 * (data_store / alias_store) to the normalized entries / aliases tables.
 */
function migrateLegacyTables(database: SqliteDatabase): void {
  const hasLegacy = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='data_store'"
  ).get();

  if (!hasLegacy) return;

  database.transaction(() => {
    // Migrate data_store → entries
    const dataRow = database.prepare(
      'SELECT data FROM data_store WHERE id = 1'
    ).get() as { data: string } | undefined;

    if (dataRow) {
      try {
        const parsed = JSON.parse(dataRow.data);
        if (typeof parsed === 'object' && parsed !== null) {
          const flat = flattenObject(parsed);
          const insert = database.prepare(
            'INSERT OR REPLACE INTO entries (key, value) VALUES (?, ?)'
          );
          for (const [key, value] of Object.entries(flat)) {
            insert.run(key, String(value));
          }
        }
      } catch { /* corrupted legacy data – skip */ }
    }

    // Migrate alias_store → aliases
    const aliasRow = database.prepare(
      'SELECT data FROM alias_store WHERE id = 1'
    ).get() as { data: string } | undefined;

    if (aliasRow) {
      try {
        const parsed = JSON.parse(aliasRow.data);
        if (typeof parsed === 'object' && parsed !== null) {
          const insert = database.prepare(
            'INSERT OR REPLACE INTO aliases (name, target) VALUES (?, ?)'
          );
          for (const [name, target] of Object.entries(parsed)) {
            if (typeof target === 'string') {
              insert.run(name, target);
            }
          }
        }
      } catch { /* corrupted legacy data – skip */ }
    }

    // Drop legacy tables
    database.exec('DROP TABLE data_store');
    database.exec('DROP TABLE alias_store');
  })();
}

/**
 * Load data from SQLite
 */
export function loadDataSqlite(): CodexData {
  try {
    const rows = getDb().prepare('SELECT key, value FROM entries').all() as { key: string; value: string }[];
    const result: CodexData = {};
    for (const row of rows) {
      setNestedValue(result, row.key, row.value);
    }
    return result;
  } catch (error) {
    console.error(color.red('Failed to load data from SQLite:'), error instanceof Error ? error.message : error);
    return {};
  }
}

/**
 * Save data to SQLite
 */
export function saveDataSqlite(data: CodexData): void {
  const flat = flattenObject(data);
  const database = getDb();

  database.transaction(() => {
    database.prepare('DELETE FROM entries').run();
    const insert = database.prepare('INSERT INTO entries (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(flat)) {
      insert.run(key, String(value));
    }
  })();
}

/**
 * Load aliases from SQLite
 */
export function loadAliasesSqlite(): Record<string, string> {
  try {
    const rows = getDb().prepare('SELECT name, target FROM aliases').all() as { name: string; target: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.name] = row.target;
    }
    return result;
  } catch (error) {
    console.error(color.red('Failed to load aliases from SQLite:'), error instanceof Error ? error.message : error);
    return {};
  }
}

/**
 * Save aliases to SQLite
 */
export function saveAliasesSqlite(aliases: Record<string, string>): void {
  const database = getDb();

  database.transaction(() => {
    database.prepare('DELETE FROM aliases').run();
    const insert = database.prepare('INSERT INTO aliases (name, target) VALUES (?, ?)');
    for (const [name, target] of Object.entries(aliases)) {
      insert.run(name, target);
    }
  })();
}

// ── Per-key operations ─────────────────────────────────────────────────

/**
 * Escape SQL LIKE wildcards in a user-provided string.
 */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

// Cached prepared statements (invalidated on closeSqlite)
let stmtGetSubtree: SqliteStatement | null = null;
let stmtDeleteChildren: SqliteStatement | null = null;
let stmtUpsertEntry: SqliteStatement | null = null;
let stmtDeleteExactOrChildren: SqliteStatement | null = null;
let stmtAllEntries: SqliteStatement | null = null;

function getStmtGetSubtree(): SqliteStatement {
  if (!stmtGetSubtree) {
    stmtGetSubtree = getDb().prepare(
      "SELECT key, value FROM entries WHERE key = ? OR key LIKE ? ESCAPE '\\'"
    );
  }
  return stmtGetSubtree;
}

function getStmtDeleteChildren(): SqliteStatement {
  if (!stmtDeleteChildren) {
    stmtDeleteChildren = getDb().prepare(
      "DELETE FROM entries WHERE key LIKE ? ESCAPE '\\'"
    );
  }
  return stmtDeleteChildren;
}

function getStmtUpsertEntry(): SqliteStatement {
  if (!stmtUpsertEntry) {
    stmtUpsertEntry = getDb().prepare(
      'INSERT OR REPLACE INTO entries (key, value) VALUES (?, ?)'
    );
  }
  return stmtUpsertEntry;
}

function getStmtDeleteExactOrChildren(): SqliteStatement {
  if (!stmtDeleteExactOrChildren) {
    stmtDeleteExactOrChildren = getDb().prepare(
      "DELETE FROM entries WHERE key = ? OR key LIKE ? ESCAPE '\\'"
    );
  }
  return stmtDeleteExactOrChildren;
}

function getStmtAllEntries(): SqliteStatement {
  if (!stmtAllEntries) {
    stmtAllEntries = getDb().prepare('SELECT key, value FROM entries');
  }
  return stmtAllEntries;
}

/**
 * Get a single value or subtree by dot-path key.
 * Returns the leaf string, a reconstructed nested object, or undefined.
 */
export function getSubtreeSqlite(key: string): CodexValue | undefined {
  try {
    const pattern = escapeLike(key) + '.%';
    const rows = getStmtGetSubtree().all(key, pattern) as { key: string; value: string }[];

    if (rows.length === 0) return undefined;

    // Exact leaf match (no children)
    if (rows.length === 1 && rows[0].key === key) return rows[0].value;

    // Subtree: strip the prefix and reconstruct
    const result: CodexData = {};
    for (const row of rows) {
      if (row.key === key) continue; // skip parent leaf if children exist
      const subKey = row.key.substring(key.length + 1);
      setNestedValue(result, subKey, row.value);
    }
    return result;
  } catch (error) {
    console.error(color.red('Failed to query SQLite:'), error instanceof Error ? error.message : error);
    return undefined;
  }
}

/**
 * Set a single leaf value by dot-path key.
 * Handles parent/child conflicts atomically.
 */
export function setEntrySqlite(key: string, value: string): void {
  const database = getDb();
  const childPattern = escapeLike(key) + '.%';

  // Compute parent prefixes that would conflict
  // e.g. for key "a.b.c", parents are ["a", "a.b"]
  const parts = key.split('.');
  const parents: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    parents.push(parts.slice(0, i).join('.'));
  }

  database.transaction(() => {
    // Remove any children of this key (subtree being replaced by leaf)
    getStmtDeleteChildren().run(childPattern);

    // Remove conflicting parent leaves
    if (parents.length > 0) {
      const placeholders = parents.map(() => '?').join(',');
      database.prepare(
        `DELETE FROM entries WHERE key IN (${placeholders})`
      ).run(...parents);
    }

    // Upsert the value
    getStmtUpsertEntry().run(key, value);
  })();
}

/**
 * Remove an entry and all its children. Returns true if anything was deleted.
 */
export function removeEntrySqlite(key: string): boolean {
  const childPattern = escapeLike(key) + '.%';
  const result = getStmtDeleteExactOrChildren().run(key, childPattern);
  return result.changes > 0;
}

/**
 * Return all entries as flat dot-path → value pairs (no unflatten overhead).
 */
export function getEntriesFlatSqlite(): Record<string, string> {
  try {
    const rows = getStmtAllEntries().all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  } catch (error) {
    console.error(color.red('Failed to load entries from SQLite:'), error instanceof Error ? error.message : error);
    return {};
  }
}

/**
 * Close the database connection
 */
export function closeSqlite(): void {
  if (db) {
    db.close();
    db = null;
  }
  // Invalidate cached prepared statements
  stmtGetSubtree = null;
  stmtDeleteChildren = null;
  stmtUpsertEntry = null;
  stmtDeleteExactOrChildren = null;
  stmtAllEntries = null;
}
