import { atomicWriteFileSync } from './atomicWrite';
import { withFileLock } from './fileLock';

export function saveJsonSorted(filePath: string, obj: Record<string, unknown>): void {
  withFileLock(filePath, () => {
    const sorted = Object.fromEntries(
      Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
    );
    atomicWriteFileSync(filePath, JSON.stringify(sorted, null, 2));
  });
}
