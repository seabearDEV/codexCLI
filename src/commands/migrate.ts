import fs from 'fs';
import { color } from '../formatting';
import { loadConfig, saveConfig } from '../config';
import { getDataFilePath, getAliasFilePath, getDbFilePath, ensureDataDirectoryExists } from '../utils/paths';
import { isSqliteAvailable, loadDataSqlite, saveDataSqlite, loadAliasesSqlite, saveAliasesSqlite, closeSqlite } from '../sqlite-backend';
import { clearDataCache } from '../storage';
import { clearAliasCache } from '../alias';
import { printError, printSuccess } from './helpers';
import { debug } from '../utils/debug';

export function migrateToSqlite(options?: { force?: boolean }): void {
  debug('migrateToSqlite called', { options });
  const config = loadConfig();

  if (config.backend === 'sqlite' && !options?.force) {
    console.log(color.yellow('Backend is already set to "sqlite". Use --force to re-migrate.'));
    return;
  }

  if (!isSqliteAvailable()) {
    printError('better-sqlite3 is not installed. Install it with: npm install better-sqlite3');
    return;
  }

  ensureDataDirectoryExists();

  // Load data directly from JSON files (bypass storage layer)
  let data = {};
  let aliases = {};

  const dataFilePath = getDataFilePath();
  const aliasFilePath = getAliasFilePath();

  try {
    if (fs.existsSync(dataFilePath)) {
      data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    }
  } catch (error) {
    printError(`Failed to read data file: ${error}`);
    return;
  }

  try {
    if (fs.existsSync(aliasFilePath)) {
      aliases = JSON.parse(fs.readFileSync(aliasFilePath, 'utf8'));
    }
  } catch (error) {
    printError(`Failed to read aliases file: ${error}`);
    return;
  }

  // Write to SQLite
  try {
    saveDataSqlite(data);
    saveAliasesSqlite(aliases);
  } catch (error) {
    printError(`Failed to write to SQLite: ${error}`);
    return;
  }

  // Update config
  config.backend = 'sqlite';
  saveConfig(config);
  clearDataCache();
  clearAliasCache();

  const dbPath = getDbFilePath();
  printSuccess('Successfully migrated to SQLite backend.');
  console.log(`Database: ${dbPath}`);
  console.log(color.gray('Original JSON files have been preserved as backups.'));
}

export function migrateToJson(options?: { force?: boolean }): void {
  debug('migrateToJson called', { options });
  const config = loadConfig();

  if (config.backend === 'json' && !options?.force) {
    console.log(color.yellow('Backend is already set to "json". Use --force to re-migrate.'));
    return;
  }

  if (!isSqliteAvailable()) {
    printError('better-sqlite3 is not installed. Cannot read from SQLite database.');
    return;
  }

  ensureDataDirectoryExists();

  // Load from SQLite
  let data;
  let aliases;

  try {
    data = loadDataSqlite();
    aliases = loadAliasesSqlite();
  } catch (error) {
    printError(`Failed to read from SQLite: ${error}`);
    return;
  }

  // Write to JSON files
  const dataFilePath = getDataFilePath();
  const aliasFilePath = getAliasFilePath();

  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
    fs.writeFileSync(aliasFilePath, JSON.stringify(aliases, null, 2), 'utf8');
  } catch (error) {
    printError(`Failed to write JSON files: ${error}`);
    return;
  }

  // Close SQLite before switching backend
  closeSqlite();

  // Update config
  config.backend = 'json';
  saveConfig(config);
  clearDataCache();
  clearAliasCache();

  printSuccess('Successfully migrated to JSON backend.');
  console.log(`Data: ${dataFilePath}`);
  console.log(`Aliases: ${aliasFilePath}`);
  console.log(color.gray('SQLite database has been preserved as a backup.'));
}
