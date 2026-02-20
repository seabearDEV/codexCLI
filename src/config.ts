import fs from 'fs';
import { getConfigFilePath, ensureDataDirectoryExists } from './utils/paths';
import { atomicWriteFileSync } from './utils/atomicWrite';

// Define the type for configuration
export interface Config {
  colors: boolean;
  theme: string;
}

export const VALID_THEMES = ['default', 'dark', 'light'] as const;
export const VALID_CONFIG_KEYS = ['colors', 'theme'] as const;

// Default configuration
const defaultConfig: Config = {
  colors: true,
  theme: 'default'
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

    if (!fs.existsSync(configPath)) {
      // Create with default values if it doesn't exist
      saveConfig(defaultConfig);
      return defaultConfig;
    }

    const currentMtime = fs.statSync(configPath).mtimeMs;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Ensure all required fields exist (handles migrating from old config)
    const result = {
      colors: config.colors ?? defaultConfig.colors,
      theme: config.theme ?? defaultConfig.theme,
    };

    configCache = result;
    configCacheMtime = currentMtime;

    return result;
  } catch (error) {
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
export function getConfigSetting(key: string): string | boolean | null {
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
  } else {
    console.error(`Unknown configuration key: ${key}`);
  }
}
