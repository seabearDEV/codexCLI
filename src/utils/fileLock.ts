import fs from 'fs';
import { debug } from './debug';

const LOCK_STALE_MS = 10_000; // Consider lock stale after 10 seconds
// Reusable buffer for Atomics.wait()-based sleep (avoids per-call allocation)
const _sleepBuf = new Int32Array(new SharedArrayBuffer(4));

/**
 * Acquire an advisory file lock using a .lock file.
 * Retries with backoff if the lock is held by another process.
 * Automatically breaks stale locks (older than LOCK_STALE_MS).
 */
export function acquireLock(filePath: string, maxRetries = 5): void {
  const lockPath = filePath + '.lock';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // O_CREAT | O_EXCL: fail if file already exists (atomic)
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EEXIST') {
        // Lock file exists — check if stale
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            // Stale lock — remove and retry immediately.
            // TOCTOU note: another process may unlink+recreate between our
            // unlink and the next openSync, but that's fine — the O_CREAT|O_EXCL
            // re-acquire is atomic so we'll just loop again.
            try { fs.unlinkSync(lockPath); } catch { /* another process may have removed it */ }
            continue;
          }
        } catch {
          // Lock file disappeared — retry
          continue;
        }

        if (attempt < maxRetries) {
          // Sleep with exponential backoff (1ms, 2ms, 4ms, 8ms, 16ms)
          const waitMs = Math.pow(2, attempt);
          Atomics.wait(_sleepBuf, 0, 0, waitMs);
          continue;
        }

        throw new Error(`Unable to acquire lock on ${filePath} after ${maxRetries} retries.`);
      }
      throw err;
    }
  }
}

/**
 * Release an advisory file lock.
 */
export function releaseLock(filePath: string): void {
  const lockPath = filePath + '.lock';
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Lock file already removed — ignore
  }
}

/**
 * Execute a function while holding a file lock.
 * Falls back to running without a lock if locking fails (e.g., in test environments).
 */
export function withFileLock<T>(filePath: string, fn: () => T): T {
  let locked = false;
  try {
    acquireLock(filePath);
    locked = true;
  } catch (err) {
    debug(`Lock acquisition failed for ${filePath}, proceeding without lock: ${String(err)}`);
  }
  try {
    return fn();
  } finally {
    if (locked) {
      releaseLock(filePath);
    }
  }
}
