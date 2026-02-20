import path from 'path';
import os from 'os';
import * as fs from 'fs';

/**
 * Determines if the application is running in development mode
 */
function isDev(): boolean {
  return process.env.NODE_ENV === 'development' || 
         Boolean(process.argv[1] && process.argv[1].includes('ts-node')) ||
         Boolean(process.env.npm_lifecycle_script && process.env.npm_lifecycle_script.includes('ts-node'));
}

// Add caching for path resolution
let dataDirectoryCache: string | null = null;
let dataFilePathCache: string | null = null;

/**
 * Get the directory where data files should be stored
 */
export function getDataDirectory(): string {
  if (dataDirectoryCache === null) {
    dataDirectoryCache = process.env.CODEX_DATA_DIR
      ?? (isDev()
        ? path.join(path.resolve(__dirname, '..', '..'), 'data')
        : path.join(os.homedir(), '.codexcli'));
  }
  return dataDirectoryCache;
}

/**
 * Ensures data directory exists
 * Creates it if it doesn't exist
 * 
 * @returns {string} Path to the data directory
 */
export function ensureDataDirectoryExists(): string {
  const dataDir = getDataDirectory();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return dataDir;
}

/**
 * Returns the path to the data file
 * 
 * @returns {string} Path to the data.json file
 */
export function getDataFilePath(): string {
  if (dataFilePathCache === null) {
    dataFilePathCache = path.join(getDataDirectory(), 'data.json');
  }
  return dataFilePathCache;
}


/**
 * Get the path to the aliases file
 *
 * @returns {string} Path to the aliases.json file
 */
export function getAliasFilePath(): string {
  return path.join(getDataDirectory(), 'aliases.json');
}

/**
 * Gets the full path to the configuration file
 * 
 * @returns {string} Absolute path to the JSON config file
 */
export function getConfigFilePath(): string {
  return path.join(getDataDirectory(), 'config.json');
}