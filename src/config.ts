import fs from 'fs';
import { getConfigFilePath, ensureDataDirectoryExists } from './utils/paths';
import { atomicWriteFileSync } from './utils/atomicWrite';

// Define the type for configuration
interface Config {
  colors: boolean;
  theme: string;
  max_backups: number;
}

const VALID_THEMES = ['default', 'dark', 'light'] as const;
export const VALID_CONFIG_KEYS = ['colors', 'theme', 'max_backups'] as const;

// Default configuration
const defaultConfig: Config = {
  colors: true,
  theme: 'default',
  max_backups: 10,
};

// Mtime-based cache for config
let configCache: Config | null = null;
let configCacheMtime: number | null = null;

export function clearConfigCache(): void {
  configCache = null;
  configCacheMtime = null;
}

// Load configuration
export function loadConfig(): Config {
  try {
    const configPath = getConfigFilePath();

    // Fast path: check cache via mtime before hitting the filesystem
    if (configCache !== null && configCacheMtime !== null) {
      try {
        if (fs.statSync(configPath).mtimeMs === configCacheMtime) {
          return configCache;
        }
      } catch {
        // File was removed; invalidate cache and fall through
        configCache = null;
        configCacheMtime = null;
      }
    }

    const currentMtime = fs.statSync(configPath).mtimeMs;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;

    // Ensure all required fields exist (handles migrating from old config)
    const result: Config = {
      colors: typeof config.colors === 'boolean' ? config.colors : defaultConfig.colors,
      theme: typeof config.theme === 'string' ? config.theme : defaultConfig.theme,
      max_backups: typeof config.max_backups === 'number' ? config.max_backups : defaultConfig.max_backups,
    };

    configCache = result;
    configCacheMtime = currentMtime;

    return result;
  } catch (error) {
    // File doesn't exist — create with defaults
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT') {
      saveConfig(defaultConfig);
      return defaultConfig;
    }
    console.error('Error loading configuration:', error);
    return defaultConfig;
  }
}

// Save configuration
export function saveConfig(config: Config): void {
  try {
    ensureDataDirectoryExists();
    const configPath = getConfigFilePath();
    atomicWriteFileSync(configPath, JSON.stringify(config, null, 2));
    const mtime = fs.statSync(configPath).mtimeMs;
    configCache = config;
    configCacheMtime = mtime;
  } catch (error) {
    console.error('Error saving configuration:', error);
  }
}

// Get a specific configuration setting
export function getConfigSetting(key: string): string | boolean | number | null {
  const config = loadConfig();
  if ((VALID_CONFIG_KEYS as readonly string[]).includes(key)) {
    return config[key as keyof Config];
  }
  console.error(`Unknown configuration key: ${key}`);
  return null;
}

// Set a specific configuration setting
export function setConfigSetting(key: string, value: string | boolean): void {
  const config = loadConfig();
  if (key === 'colors') {
    config.colors = typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true' || value === '1';
    saveConfig(config);
  } else if (key === 'theme') {
    const val = String(value);
    if (!(VALID_THEMES as readonly string[]).includes(val)) {
      console.error(`Invalid theme: '${val}'. Must be one of: ${VALID_THEMES.join(', ')}`);
      return;
    }
    config.theme = val;
    saveConfig(config);
  } else if (key === 'max_backups') {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) {
      console.error(`Invalid max_backups: '${value}'. Must be a non-negative integer (0 to disable rotation).`);
      return;
    }
    config.max_backups = num;
    saveConfig(config);
  } else {
    console.error(`Unknown configuration key: ${key}`);
  }
}
