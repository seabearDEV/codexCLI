import { atomicWriteFileSync } from './atomicWrite';

export function saveJsonSorted(filePath: string, obj: Record<string, unknown>): void {
  const sorted = Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  );
  atomicWriteFileSync(filePath, JSON.stringify(sorted, null, 2));
}
