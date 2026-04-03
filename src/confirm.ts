import { debug } from './utils/debug';
import { Scope, loadConfirmMap, saveConfirmMap, loadConfirmMapMerged, clearStoreCaches, findProjectFile } from './store';

export { Scope } from './store';

export function clearConfirmCache(): void {
  clearStoreCaches();
}

export function loadConfirmKeys(scope?: Scope | undefined): Record<string, true> {
  if (!scope || scope === 'auto') {
    return loadConfirmMapMerged();
  }
  return loadConfirmMap(scope);
}

export function saveConfirmKeys(data: Record<string, true>, scope?: Scope | undefined): void {
  saveConfirmMap(data, scope);
}

// Mark a key as requiring confirmation
export function setConfirm(key: string, scope?: Scope | undefined): void {
  const keys = loadConfirmMap(scope);
  keys[key] = true;
  saveConfirmMap(keys, scope);
  debug(`Confirm set for key: "${key}"`);
}

// Remove confirmation requirement from a key
export function removeConfirm(key: string, scope?: Scope | undefined): void {
  if (!scope || scope === 'auto') {
    // Try project first, then global
    if (findProjectFile()) {
      const projectKeys = loadConfirmMap('project');
      if (key in projectKeys) {
        delete projectKeys[key];
        saveConfirmMap(projectKeys, 'project');
        debug(`Confirm removed for key: "${key}" (project)`);
        return;
      }
    }
    const globalKeys = loadConfirmMap('global');
    if (key in globalKeys) {
      delete globalKeys[key];
      saveConfirmMap(globalKeys, 'global');
      debug(`Confirm removed for key: "${key}" (global)`);
    }
    return;
  }

  const keys = loadConfirmMap(scope);
  if (key in keys) {
    delete keys[key];
    saveConfirmMap(keys, scope);
    debug(`Confirm removed for key: "${key}"`);
  }
}

// Check if a key requires confirmation (checks merged)
export function hasConfirm(key: string): boolean {
  const keys = loadConfirmMapMerged();
  return keys[key] === true;
}

// Cascade delete: remove key and any children (e.g., removing "commands" removes "commands.deploy")
export function removeConfirmForKey(key: string, scope?: Scope | undefined): void {
  if (!scope || scope === 'auto') {
    removeConfirmFromScope(key, 'global');
    if (findProjectFile()) {
      removeConfirmFromScope(key, 'project');
    }
    return;
  }
  removeConfirmFromScope(key, scope);
}

function removeConfirmFromScope(key: string, scope: 'project' | 'global'): void {
  const keys = loadConfirmMap(scope);
  const prefix = key + '.';
  let changed = false;
  for (const k of Object.keys(keys)) {
    if (k === key || k.startsWith(prefix)) {
      delete keys[k];
      changed = true;
    }
  }
  if (changed) {
    saveConfirmMap(keys, scope);
  }
}
