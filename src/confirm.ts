import { getConfirmFilePath } from './utils/paths';
import { debug } from './utils/debug';
import { createCachedStore } from './utils/cachedStore';

// Interface for the confirm storage (set of keys requiring confirmation)
type ConfirmMap = Record<string, true>;

const store = createCachedStore<ConfirmMap>(getConfirmFilePath, 'confirm keys');
// eslint-disable-next-line @typescript-eslint/unbound-method
export const clearConfirmCache = store.clear;
// eslint-disable-next-line @typescript-eslint/unbound-method
export const loadConfirmKeys = store.load;
// eslint-disable-next-line @typescript-eslint/unbound-method
export const saveConfirmKeys = store.save;

// Mark a key as requiring confirmation
export function setConfirm(key: string): void {
  const keys = loadConfirmKeys();
  keys[key] = true;
  saveConfirmKeys(keys);
  debug(`Confirm set for key: "${key}"`);
}

// Remove confirmation requirement from a key
export function removeConfirm(key: string): void {
  const keys = loadConfirmKeys();
  if (key in keys) {
    delete keys[key];
    saveConfirmKeys(keys);
    debug(`Confirm removed for key: "${key}"`);
  }
}

// Check if a key requires confirmation
export function hasConfirm(key: string): boolean {
  const keys = loadConfirmKeys();
  return keys[key] === true;
}

// Cascade delete: remove key and any children (e.g., removing "commands" removes "commands.deploy")
export function removeConfirmForKey(key: string): void {
  const keys = loadConfirmKeys();
  const prefix = key + '.';
  let changed = false;
  for (const k of Object.keys(keys)) {
    if (k === key || k.startsWith(prefix)) {
      delete keys[k];
      changed = true;
    }
  }
  if (changed) {
    saveConfirmKeys(keys);
  }
}
