import fs from 'fs';
import path from 'path';
import { getDataDirectory } from './paths';
import { debug } from './debug';
import { getConfigSetting } from '../config';

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

    let backedUp = 0;

    // v1.10.0 store directory — copied recursively
    const storeDir = path.join(dataDir, 'store');
    if (fs.existsSync(storeDir) && fs.statSync(storeDir).isDirectory()) {
      const destStore = path.join(backupSubDir, 'store');
      fs.cpSync(storeDir, destStore, { recursive: true });
      backedUp++;
    }

    // Legacy files — may still exist pre-migration or as .backup artifacts
    // post-migration. Back them up alongside the new store directory.
    const legacyFiles = ['data.json', 'entries.json', 'aliases.json', 'confirm.json'];
    for (const file of legacyFiles) {
      const src = path.join(dataDir, file);
      if (fs.existsSync(src)) {
        const dest = path.join(backupSubDir, file);
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, 0o600);
        backedUp++;
      }
    }

    if (backedUp === 0) {
      // Nothing to back up — remove the empty directory
      try { fs.rmSync(backupSubDir); } catch { /* ignore */ }
      return null;
    }

    debug(`Auto-backup created: ${backupSubDir} (${backedUp} files)`);

    // Rotate: keep only the N most recent backups (0 = no rotation)
    try {
      const configuredMaxBackups = Number(getConfigSetting('max_backups'));
      const maxBackups = Number.isNaN(configuredMaxBackups) ? 10 : configuredMaxBackups;
      if (maxBackups > 0) {
        const allBackups = fs.readdirSync(backupDir)
          .map(name => {
            const fullPath = path.join(backupDir, name);
            const stats = fs.statSync(fullPath);
            return { name, stats };
          })
          .filter(entry => entry.stats.isDirectory())
          .sort((a, b) => a.stats.mtimeMs - b.stats.mtimeMs)
          .map(entry => entry.name);
        if (allBackups.length > maxBackups) {
          const toRemove = allBackups.slice(0, allBackups.length - maxBackups);
          for (const old of toRemove) {
            fs.rmSync(path.join(backupDir, old), { recursive: true, force: true });
          }
          debug(`Removed ${toRemove.length} old backup(s), keeping ${maxBackups}`);
        }
      }
    } catch (cleanupErr) {
      debug(`Backup cleanup failed: ${String(cleanupErr)}`);
    }

    return backupSubDir;
  } catch (error) {
    debug(`Auto-backup failed: ${String(error)}`);
    return null;
  }
}
