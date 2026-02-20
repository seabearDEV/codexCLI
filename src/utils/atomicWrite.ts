import fs from 'fs';

/**
 * Write a file atomically by writing to a temporary file first,
 * then renaming into place. On POSIX systems, rename is atomic,
 * so the target file is never left in a partial/corrupt state.
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}
