import fs from 'fs';
import { getDataDirectory, getAliasFilePath } from './utils/paths';
import { debug } from './utils/debug';
import { atomicWriteFileSync } from './utils/atomicWrite';

// Interface for the aliases storage
interface AliasMap {
  [key: string]: string;
}

// Mtime-based cache for aliases
let aliasCache: AliasMap | null = null;
let aliasCacheMtime: number | null = null;

export function clearAliasCache(): void {
  aliasCache = null;
  aliasCacheMtime = null;
}

// Load aliases from storage
export function loadAliases(): AliasMap {
  const aliasPath = getAliasFilePath();

  try {
    // Fast path: check cache via mtime before hitting the filesystem
    if (aliasCache !== null && aliasCacheMtime !== null) {
      try {
        if (fs.statSync(aliasPath).mtimeMs === aliasCacheMtime) {
          return aliasCache;
        }
      } catch {
        aliasCache = null;
        aliasCacheMtime = null;
      }
    }

    if (!fs.existsSync(aliasPath)) return {};

    const currentMtime = fs.statSync(aliasPath).mtimeMs;
    const data = fs.readFileSync(aliasPath, 'utf8');
    const result = data && data.trim() ? JSON.parse(data) : {};

    aliasCache = result;
    aliasCacheMtime = currentMtime;

    return result;
  } catch (error) {
    if (!(error instanceof SyntaxError && error.message.includes('Unexpected end'))) {
      console.error('Error loading aliases:', error);
    }
    return {};
  }
}

// Save aliases to storage
export function saveAliases(aliases: AliasMap): void {
  const aliasPath = getAliasFilePath();
  const dataDir = getDataDirectory();

  try {
    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    atomicWriteFileSync(aliasPath, JSON.stringify(aliases, null, 2));
    const mtime = fs.statSync(aliasPath).mtimeMs;
    aliasCache = aliases;
    aliasCacheMtime = mtime;
  } catch (error) {
    console.error('Error saving aliases:', error);
  }
}

// Create or update an alias (one alias per entry — replaces any existing alias for the same target)
export function setAlias(alias: string, path: string): void {
  const aliases = loadAliases();
  // Enforce one alias per entry: remove any existing alias pointing to the same target
  for (const [existingAlias, target] of Object.entries(aliases)) {
    if (target === path && existingAlias !== alias) {
      delete aliases[existingAlias];
    }
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
  const resolved = aliases[key] || key;
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
