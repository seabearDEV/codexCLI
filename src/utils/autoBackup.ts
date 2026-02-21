import fs from 'fs';
import path from 'path';
import { getDataDirectory } from './paths';
import { debug } from './debug';

/**
 * Create automatic backups of data files before destructive operations.
 * Backups are stored in a `.backups` subdirectory within the data directory.
 */
export function createAutoBackup(label: string): string | null {
  const dataDir = getDataDirectory();
  const backupDir = path.join(dataDir, '.backups');

  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const backupSubDir = path.join(backupDir, `${label}-${timestamp}`);
    fs.mkdirSync(backupSubDir, { mode: 0o700 });

    const filesToBackup = ['entries.json', 'aliases.json', 'confirm.json'];
    let backedUp = 0;

    for (const file of filesToBackup) {
      const src = path.join(dataDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(backupSubDir, file));
        backedUp++;
      }
    }

    if (backedUp === 0) {
      // Nothing to back up — remove the empty directory
      try { fs.rmdirSync(backupSubDir); } catch { /* ignore */ }
      return null;
    }

    debug(`Auto-backup created: ${backupSubDir} (${backedUp} files)`);
    return backupSubDir;
  } catch (error) {
    debug(`Auto-backup failed: ${error}`);
    return null;
  }
}
