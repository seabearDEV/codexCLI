import { color } from './formatting';
import { getNestedValue, setNestedValue, removeNestedValue, flattenObject } from './utils/objectPath';
import { CodexData, CodexValue } from './types';
import { debug } from './utils/debug';
import { Scope, loadEntries, saveEntries, loadEntriesMerged, findProjectFile, saveEntriesAndTouchMeta, saveEntriesAndRemoveMeta } from './store';
import { isValidEntryKey } from './utils/directoryStore';

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

  if (process.env.DEBUG === 'true') {
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
export function loadData(scope?: Scope  ): CodexData {
  debug('loadData called', { scope });
  if (!scope || scope === 'auto') {
    return loadEntriesMerged();
  }
  return loadEntries(scope);
}

/**
 * Save data to storage
 */
export function saveData(data: CodexData, scope?: Scope  ): void {
  saveEntries(data, scope);
}

// ── Per-key operations ─────────────────────────────────────────────────

/**
 * Get a value or subtree by dot-path key.
 * With 'auto' scope: checks project first, falls through to global.
 */
export function getValue(key: string, scope?: Scope  ): CodexValue | undefined {
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
 *
 * Validates the key at this boundary so invalid keys (path traversal,
 * sidecar collisions, prototype pollution attempts, leading/trailing dots,
 * empty segments) reject *before* any in-memory mutation. Without this gate,
 * a key like ".dotleading" would slip through setNestedValue (which only
 * blocks __proto__/constructor/prototype) and create a phantom entry under
 * the empty-string key, then get silently normalized on flatten — producing
 * a write that the read path could never find.
 */
export function setValue(key: string, value: string, scope?: Scope  ): void {
  if (!isValidEntryKey(key)) {
    throw new Error(`Invalid store key: ${JSON.stringify(key)}`);
  }
  const effectiveScope = scope ?? 'auto';
  const data = loadEntries(effectiveScope);
  setNestedValue(data, key, value);
  saveEntriesAndTouchMeta(data, key, effectiveScope);
}

/**
 * Remove an entry (and children) by dot-path key. Returns true if anything was removed.
 * With 'auto' scope: removes from whichever scope contains it (project preferred).
 */
export function removeValue(key: string, scope?: Scope  ): boolean {
  if (!isValidEntryKey(key)) {
    // An invalid key cannot match any real entry — return false instead of
    // throwing, so callers that probe with user input get a clean "not found"
    // rather than a stack trace.
    return false;
  }
  if (!scope || scope === 'auto') {
    if (findProjectFile()) {
      const projectData = loadEntries('project');
      if (getNestedValue(projectData, key) !== undefined) {
        const removed = removeNestedValue(projectData, key);
        if (removed) {
          saveEntriesAndRemoveMeta(projectData, key, 'project');
        }
        return removed;
      }
    }
    // Fall through to global
    const globalData = loadEntries('global');
    const removed = removeNestedValue(globalData, key);
    if (removed) {
      saveEntriesAndRemoveMeta(globalData, key, 'global');
    }
    return removed;
  }

  const data = loadEntries(scope);
  const removed = removeNestedValue(data, key);
  if (removed) {
    saveEntriesAndRemoveMeta(data, key, scope);
  }
  return removed;
}

/**
 * Return all entries as flat dot-path -> value pairs.
 * With 'auto' scope: merges project over global.
 */
export function getEntriesFlat(scope?: Scope  ): Record<string, string> {
  if (!scope || scope === 'auto') {
    return flattenObject(loadEntriesMerged());
  }
  return flattenObject(loadEntries(scope));
}

/**
 * Validate that every leaf key in an entries object passes isValidEntryKey,
 * throwing a descriptive error listing all bad keys if any. Used by import
 * handlers (CLI and MCP) so a JSON payload containing prototype-pollution
 * names, sidecar collisions, leading dots, etc. is rejected up-front instead
 * of being silently dropped by isSafeKey or partly applied.
 *
 * Walks the object directly rather than going through flattenObject because
 * flattenObject does `obj['__proto__']` which triggers the prototype getter
 * (returns Object.prototype, recurses into nothing) and silently drops the
 * key — exactly the bug we're trying to catch. This walk uses
 * getOwnPropertyDescriptor to read the actual own-property value, bypassing
 * the inherited accessor.
 */
export function validateImportEntries(obj: Record<string, unknown>): void {
  const invalid: string[] = [];

  function walk(node: Record<string, unknown>, prefix: string): void {
    for (const key of Object.getOwnPropertyNames(node)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const desc = Object.getOwnPropertyDescriptor(node, key);
      // Use the descriptor's value, not node[key], so __proto__ as an own
      // property is read as a data value rather than triggering the getter.
      const value = desc?.value as unknown;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Validate the prefix segment we're about to descend through.
        if (!isValidEntryKey(fullKey)) invalid.push(fullKey);
        walk(value as Record<string, unknown>, fullKey);
      } else {
        if (!isValidEntryKey(fullKey)) invalid.push(fullKey);
      }
    }
  }

  walk(obj, '');

  if (invalid.length > 0) {
    const list = invalid.map(k => JSON.stringify(k)).join(', ');
    throw new Error(`Import contains invalid entry keys: ${list}`);
  }
}

/**
 * Validate an alias-map import. Both alias names AND target paths must be
 * valid entry keys; non-string values are rejected separately by callers.
 *
 * Uses getOwnPropertyNames + getOwnPropertyDescriptor to enumerate keys and
 * read values, so a JSON.parse'd object with an own __proto__ property is
 * actually visible (Object.entries / obj[key] would trigger the prototype
 * getter and silently miss it).
 */
export function validateImportAliases(obj: Record<string, unknown>): void {
  const invalidNames: string[] = [];
  const invalidTargets: string[] = [];
  for (const name of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, name);
    const target = desc?.value as unknown;
    if (!isValidEntryKey(name)) invalidNames.push(name);
    if (typeof target === 'string' && !isValidEntryKey(target)) invalidTargets.push(target);
  }
  if (invalidNames.length > 0 || invalidTargets.length > 0) {
    const parts: string[] = [];
    if (invalidNames.length > 0) {
      parts.push(`invalid alias names: ${invalidNames.map(k => JSON.stringify(k)).join(', ')}`);
    }
    if (invalidTargets.length > 0) {
      parts.push(`invalid alias targets: ${invalidTargets.map(k => JSON.stringify(k)).join(', ')}`);
    }
    throw new Error(`Import contains ${parts.join('; ')}`);
  }
}

/**
 * Validate a confirm-map import. Each key must be a valid entry key.
 * Uses getOwnPropertyNames so __proto__ as an own property is enumerated.
 */
export function validateImportConfirm(obj: Record<string, unknown>): void {
  const invalid = Object.getOwnPropertyNames(obj).filter(k => !isValidEntryKey(k));
  if (invalid.length > 0) {
    const list = invalid.map(k => JSON.stringify(k)).join(', ');
    throw new Error(`Import contains invalid confirm keys: ${list}`);
  }
}
