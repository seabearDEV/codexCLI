import fs from 'fs';
import { ensureDataDirectoryExists } from './paths';
import { saveJsonSorted } from './saveJsonSorted';

export function createCachedStore<T extends Record<string, unknown>>(
  getFilePath: () => string,
  errorLabel: string
): { load(): T; save(data: T): void; clear(): void } {
  let cache: T | null = null;
  let cacheMtime: number | null = null;

  function clear(): void {
    cache = null;
    cacheMtime = null;
  }

  function load(): T {
    const filePath = getFilePath();

    try {
      if (cache !== null && cacheMtime !== null) {
        try {
          if (fs.statSync(filePath).mtimeMs === cacheMtime) {
            return cache;
          }
        } catch {
          cache = null;
          cacheMtime = null;
        }
      }

      if (!fs.existsSync(filePath)) return {} as T;

      const currentMtime = fs.statSync(filePath).mtimeMs;
      const data = fs.readFileSync(filePath, 'utf8');
      const result = (data?.trim() ? JSON.parse(data) : {}) as T;

      cache = result;
      cacheMtime = currentMtime;

      return result;
    } catch (error) {
      if (!(error instanceof SyntaxError && error.message.includes('Unexpected end'))) {
        console.error(`Error loading ${errorLabel}:`, error);
      }
      return {} as T;
    }
  }

  function save(data: T): void {
    const filePath = getFilePath();

    try {
      ensureDataDirectoryExists();
      saveJsonSorted(filePath, data as Record<string, unknown>);
      const mtime = fs.statSync(filePath).mtimeMs;
      cache = data;
      cacheMtime = mtime;
    } catch (error) {
      console.error(`Error saving ${errorLabel}:`, error);
    }
  }

  return { load, save, clear };
}
