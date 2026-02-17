import fs from 'fs';
import { color } from './formatting';
import { getDataFilePath } from './utils/paths';
import {
  useSqlite, loadDataSqlite, saveDataSqlite,
  getSubtreeSqlite, setEntrySqlite, removeEntrySqlite, getEntriesFlatSqlite
} from './sqlite-backend';
import { getNestedValue, setNestedValue, removeNestedValue, flattenObject } from './utils/objectPath';
import { CodexData, CodexValue } from './types';
import { debug } from './utils/debug';

// Mtime-based cache for data
let dataCache: CodexData | null = null;
let dataCacheMtime: number | null = null;

export function clearDataCache(): void {
  dataCache = null;
  dataCacheMtime = null;
}

/**
 * Handle operation with consistent error handling
 */
export function handleOperation<T>(operation: () => T, errorMessage: string): T | null {
  try {
    return operation();
  } catch (error) {
    handleError(errorMessage, error);
    return null;
  }
}

/**
 * Extract a human-readable message from an unknown error value
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Consistent error handling with improved context
 */
export function handleError(message: string, error: unknown, context?: string): void {
  const contextPrefix = context ? `[${context}] ` : '';
  
  if (process.env.DEBUG) {
    console.error(`${color.red(contextPrefix + message)}: `, error);
    if (error instanceof Error && error.stack) {
      console.error(color.gray(error.stack));
    }
  } else {
    console.error(color.red(contextPrefix + message));
  }
}

/**
 * Load data from storage
 */
export function loadData(): CodexData {
  if (useSqlite()) {
    debug('loadData: using SQLite backend');
    return loadDataSqlite();
  }

  const filePath = getDataFilePath();
  debug('loadData: using JSON backend', { filePath });

  // Fast path: check cache via mtime before hitting the filesystem
  if (dataCache !== null && dataCacheMtime !== null) {
    try {
      if (fs.statSync(filePath).mtimeMs === dataCacheMtime) {
        return dataCache;
      }
    } catch {
      dataCache = null;
      dataCacheMtime = null;
    }
  }

  if (!fs.existsSync(filePath)) {
    return {};
  }

  const currentMtime = fs.statSync(filePath).mtimeMs;
  const result = handleOperation(() => {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }, `Failed to load data from ${filePath}`) || {};

  dataCache = result;
  dataCacheMtime = currentMtime;

  return result;
}

/**
 * Save data to storage
 */
export function saveData(data: CodexData): void {
  if (useSqlite()) {
    saveDataSqlite(data);
    return;
  }

  const filePath = getDataFilePath();

  const result = handleOperation(() => {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }, `Failed to save data to ${filePath}`);

  if (result) {
    dataCache = data;
    dataCacheMtime = fs.statSync(filePath).mtimeMs;
  }
}

// ── Per-key operations ─────────────────────────────────────────────────

/**
 * Get a value or subtree by dot-path key without loading all data.
 */
export function getValue(key: string): CodexValue | undefined {
  if (useSqlite()) {
    return getSubtreeSqlite(key);
  }
  return getNestedValue(loadData(), key);
}

/**
 * Set a single leaf value by dot-path key without rewriting all data.
 */
export function setValue(key: string, value: string): void {
  if (useSqlite()) {
    setEntrySqlite(key, value);
    return;
  }
  const data = loadData();
  setNestedValue(data, key, value);
  saveData(data);
}

/**
 * Remove an entry (and children) by dot-path key. Returns true if anything was removed.
 */
export function removeValue(key: string): boolean {
  if (useSqlite()) {
    return removeEntrySqlite(key);
  }
  const data = loadData();
  const removed = removeNestedValue(data, key);
  if (removed) saveData(data);
  return removed;
}

/**
 * Return all entries as flat dot-path → value pairs.
 * Skips the unflatten/re-flatten round-trip when on SQLite.
 */
export function getEntriesFlat(): Record<string, string> {
  if (useSqlite()) {
    return getEntriesFlatSqlite();
  }
  return flattenObject(loadData());
}

