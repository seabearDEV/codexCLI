import fs from 'fs';
import { getDataDirectory, getConfirmFilePath } from './utils/paths';
import { debug } from './utils/debug';
import { atomicWriteFileSync } from './utils/atomicWrite';

// Interface for the confirm storage (set of keys requiring confirmation)
interface ConfirmMap {
  [key: string]: true;
}

// Mtime-based cache for confirm keys
let confirmCache: ConfirmMap | null = null;
let confirmCacheMtime: number | null = null;

export function clearConfirmCache(): void {
  confirmCache = null;
  confirmCacheMtime = null;
}

// Load confirm keys from storage
export function loadConfirmKeys(): ConfirmMap {
  const confirmPath = getConfirmFilePath();

  try {
    // Fast path: check cache via mtime before hitting the filesystem
    if (confirmCache !== null && confirmCacheMtime !== null) {
      try {
        if (fs.statSync(confirmPath).mtimeMs === confirmCacheMtime) {
          return confirmCache;
        }
      } catch {
        confirmCache = null;
        confirmCacheMtime = null;
      }
    }

    if (!fs.existsSync(confirmPath)) return {};

    const currentMtime = fs.statSync(confirmPath).mtimeMs;
    const data = fs.readFileSync(confirmPath, 'utf8');
    const result = data && data.trim() ? JSON.parse(data) : {};

    confirmCache = result;
    confirmCacheMtime = currentMtime;

    return result;
  } catch (error) {
    if (!(error instanceof SyntaxError && error.message.includes('Unexpected end'))) {
      console.error('Error loading confirm keys:', error);
    }
    return {};
  }
}

// Save confirm keys to storage
export function saveConfirmKeys(keys: ConfirmMap): void {
  const confirmPath = getConfirmFilePath();
  const dataDir = getDataDirectory();

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const sorted = Object.fromEntries(Object.entries(keys).sort(([a], [b]) => a.localeCompare(b)));
    atomicWriteFileSync(confirmPath, JSON.stringify(sorted, null, 2));
    const mtime = fs.statSync(confirmPath).mtimeMs;
    confirmCache = keys;
    confirmCacheMtime = mtime;
  } catch (error) {
    console.error('Error saving confirm keys:', error);
  }
}

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
