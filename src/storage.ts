import { color } from './formatting';
import { getNestedValue, setNestedValue, removeNestedValue, flattenObject } from './utils/objectPath';
import { CodexData, CodexValue } from './types';
import { debug } from './utils/debug';
import { Scope, loadEntries, saveEntries, loadEntriesMerged, findProjectFile } from './store';

export { Scope } from './store';

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
export function loadData(scope?: Scope | undefined): CodexData {
  debug('loadData called', { scope });
  if (!scope || scope === 'auto') {
    return loadEntriesMerged();
  }
  return loadEntries(scope);
}

/**
 * Save data to storage
 */
export function saveData(data: CodexData, scope?: Scope | undefined): void {
  saveEntries(data, scope);
}

// ── Per-key operations ─────────────────────────────────────────────────

/**
 * Get a value or subtree by dot-path key.
 * With 'auto' scope: checks project first, falls through to global.
 */
export function getValue(key: string, scope?: Scope | undefined): CodexValue | undefined {
  if (!scope || scope === 'auto') {
    // Fallthrough: project first, then global
    if (findProjectFile()) {
      const projectVal = getNestedValue(loadEntries('project'), key);
      if (projectVal !== undefined) return projectVal;
      return getNestedValue(loadEntries('global'), key);
    }
    return getNestedValue(loadEntries('global'), key);
  }
  return getNestedValue(loadEntries(scope), key);
}

/**
 * Set a single leaf value by dot-path key.
 */
export function setValue(key: string, value: string, scope?: Scope | undefined): void {
  const effectiveScope = scope ?? 'auto';
  const data = loadEntries(effectiveScope);
  setNestedValue(data, key, value);
  saveEntries(data, effectiveScope);
}

/**
 * Remove an entry (and children) by dot-path key. Returns true if anything was removed.
 * With 'auto' scope: removes from whichever scope contains it (project preferred).
 */
export function removeValue(key: string, scope?: Scope | undefined): boolean {
  if (!scope || scope === 'auto') {
    if (findProjectFile()) {
      const projectData = loadEntries('project');
      if (getNestedValue(projectData, key) !== undefined) {
        const removed = removeNestedValue(projectData, key);
        if (removed) saveEntries(projectData, 'project');
        return removed;
      }
    }
    // Fall through to global
    const globalData = loadEntries('global');
    const removed = removeNestedValue(globalData, key);
    if (removed) saveEntries(globalData, 'global');
    return removed;
  }

  const data = loadEntries(scope);
  const removed = removeNestedValue(data, key);
  if (removed) saveEntries(data, scope);
  return removed;
}

/**
 * Return all entries as flat dot-path -> value pairs.
 * With 'auto' scope: merges project over global.
 */
export function getEntriesFlat(scope?: Scope | undefined): Record<string, string> {
  if (!scope || scope === 'auto') {
    return flattenObject(loadEntriesMerged());
  }
  return flattenObject(loadEntries(scope));
}
