import { debug } from './utils/debug';
import { Scope, loadAliasMap, saveAliasMap, loadAliasMapMerged, findProjectFile } from './store';



export function loadAliases(scope?: Scope | undefined): Record<string, string> {
  if (!scope || scope === 'auto') {
    return loadAliasMapMerged();
  }
  return loadAliasMap(scope);
}

export function saveAliases(data: Record<string, string>, scope?: Scope | undefined): void {
  saveAliasMap(data, scope);
}

// Create or update an alias (one alias per entry — replaces any existing alias for the same target)
export function setAlias(alias: string, path: string, scope?: Scope | undefined): void {
  const aliases = loadAliasMap(scope);
  // Enforce one alias per entry: O(1) lookup via inverted map
  const keyToAlias = buildKeyToAliasMap(aliases);
  const existing = keyToAlias[path];
  if (existing && existing !== alias) {
    delete aliases[existing];
  }
  aliases[alias] = path;
  saveAliasMap(aliases, scope);
  console.log(`Alias '${alias}' added successfully.`);
}

// Remove an alias
export function removeAlias(alias: string, scope?: Scope | undefined): boolean {
  if (!scope || scope === 'auto') {
    // Try project first, then global
    if (findProjectFile()) {
      const projectAliases = loadAliasMap('project');
      if (alias in projectAliases) {
        delete projectAliases[alias];
        saveAliasMap(projectAliases, 'project');
        return true;
      }
    }
    const globalAliases = loadAliasMap('global');
    if (alias in globalAliases) {
      delete globalAliases[alias];
      saveAliasMap(globalAliases, 'global');
      return true;
    }
    return false;
  }

  const aliases = loadAliasMap(scope);
  if (alias in aliases) {
    delete aliases[alias];
    saveAliasMap(aliases, scope);
    return true;
  }
  return false;
}

// Rename an alias
export function renameAlias(oldName: string, newName: string, scope?: Scope | undefined): boolean {
  if (!scope || scope === 'auto') {
    // Try project first, then global
    if (findProjectFile()) {
      const projectAliases = loadAliasMap('project');
      if (oldName in projectAliases) {
        if (newName in projectAliases) return false;
        projectAliases[newName] = projectAliases[oldName];
        delete projectAliases[oldName];
        saveAliasMap(projectAliases, 'project');
        return true;
      }
    }
    const globalAliases = loadAliasMap('global');
    if (!(oldName in globalAliases)) return false;
    if (newName in globalAliases) return false;
    globalAliases[newName] = globalAliases[oldName];
    delete globalAliases[oldName];
    saveAliasMap(globalAliases, 'global');
    return true;
  }

  const aliases = loadAliasMap(scope);
  if (!(oldName in aliases)) return false;
  if (newName in aliases) return false;
  aliases[newName] = aliases[oldName];
  delete aliases[oldName];
  saveAliasMap(aliases, scope);
  return true;
}

// Resolve a key that might be an alias
// With 'auto' scope: checks project aliases first, then global
export function resolveKey(key: string, scope?: Scope | undefined): string {
  // Strip trailing colon (CLI tab-completion artifact)
  const cleanKey = key.replace(/:$/, '');
  if (!scope || scope === 'auto') {
    const merged = loadAliasMapMerged();
    const resolved = merged[cleanKey] ?? cleanKey;
    if (resolved !== key) {
      debug(`Alias resolved: "${key}" -> "${resolved}"`);
    }
    return resolved;
  }
  const aliases = loadAliasMap(scope);
  const resolved = aliases[cleanKey] ?? cleanKey;
  if (resolved !== key) {
    debug(`Alias resolved: "${key}" -> "${resolved}"`);
  }
  return resolved;
}

// Remove any aliases whose target matches `key` or is a child of `key` (cascade delete)
export function removeAliasesForKey(key: string, scope?: Scope | undefined): void {
  if (!scope || scope === 'auto') {
    // Remove from both scopes
    removeAliasesFromScope(key, 'global');
    if (findProjectFile()) {
      removeAliasesFromScope(key, 'project');
    }
    return;
  }
  removeAliasesFromScope(key, scope);
}

function removeAliasesFromScope(key: string, scope: 'project' | 'global'): void {
  const aliases = loadAliasMap(scope);
  const prefix = key + '.';
  let changed = false;
  for (const [alias, target] of Object.entries(aliases)) {
    if (target === key || target.startsWith(prefix)) {
      delete aliases[alias];
      changed = true;
    }
  }
  if (changed) {
    saveAliasMap(aliases, scope);
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
