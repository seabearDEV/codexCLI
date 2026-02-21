import fs from 'fs';

/**
 * Write a file atomically by writing to a temporary file first,
 * then renaming into place. On POSIX systems, rename is atomic,
 * so the target file is never left in a partial/corrupt state.
 * Files are created with mode 0600 (owner read/write only).
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}
