import { getAliasFilePath } from './utils/paths';
import { debug } from './utils/debug';
import { createCachedStore } from './utils/cachedStore';

// Interface for the aliases storage
type AliasMap = Record<string, string>;

const store = createCachedStore<AliasMap>(getAliasFilePath, 'aliases');
// eslint-disable-next-line @typescript-eslint/unbound-method
export const clearAliasCache = store.clear;
// eslint-disable-next-line @typescript-eslint/unbound-method
export const loadAliases = store.load;
// eslint-disable-next-line @typescript-eslint/unbound-method
export const saveAliases = store.save;

// Create or update an alias (one alias per entry — replaces any existing alias for the same target)
export function setAlias(alias: string, path: string): void {
  const aliases = loadAliases();
  // Enforce one alias per entry: O(1) lookup via inverted map
  const keyToAlias = buildKeyToAliasMap(aliases);
  const existing = keyToAlias[path];
  if (existing && existing !== alias) {
    delete aliases[existing];
  }
  aliases[alias] = path;
  saveAliases(aliases);
  console.log(`Alias '${alias}' added successfully.`);
}

// Remove an alias
export function removeAlias(alias: string): boolean {
  const aliases = loadAliases();

  if (alias in aliases) {
    delete aliases[alias];
    saveAliases(aliases);
    return true;
  }

  return false;
}

// Rename an alias
export function renameAlias(oldName: string, newName: string): boolean {
  const aliases = loadAliases();

  if (!(oldName in aliases)) return false;
  if (newName in aliases) return false;

  aliases[newName] = aliases[oldName];
  delete aliases[oldName];
  saveAliases(aliases);
  return true;
}

// Resolve a key that might be an alias
export function resolveKey(key: string): string {
  const aliases = loadAliases();
  const resolved = aliases[key] ?? key;
  if (resolved !== key) {
    debug(`Alias resolved: "${key}" -> "${resolved}"`);
  }
  return resolved;
}

// Remove any aliases whose target matches `key` or is a child of `key` (cascade delete)
export function removeAliasesForKey(key: string): void {
  const aliases = loadAliases();
  const prefix = key + '.';
  let changed = false;
  for (const [alias, target] of Object.entries(aliases)) {
    if (typeof target === 'string' && (target === key || target.startsWith(prefix))) {
      delete aliases[alias];
      changed = true;
    }
  }
  if (changed) {
    saveAliases(aliases);
  }
}

// Build inverted map from target paths to alias name (one alias per entry)
export function buildKeyToAliasMap(aliases?: Record<string, string>): Record<string, string> {
  const resolved = aliases ?? loadAliases();
  const keyToAliasMap: Record<string, string> = {};
  for (const [alias, target] of Object.entries(resolved)) {
    keyToAliasMap[target] = alias;
  }
  return keyToAliasMap;
}
