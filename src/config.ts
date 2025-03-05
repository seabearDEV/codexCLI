import fs from 'fs';
import { getConfigFilePath, ensureDataDirectoryExists } from './utils/paths';

// Define the type for configuration
export interface Config {
  colors: boolean;
  theme: string;
}

// Default configuration
const defaultConfig: Config = {
  colors: true,
  theme: 'default'
};

// Load configuration
export function loadConfig(): Config {
  try {
    const configPath = getConfigFilePath();
    if (!fs.existsSync(configPath)) {
      // Create with default values if it doesn't exist
      saveConfig(defaultConfig);
      return defaultConfig;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Ensure all required fields exist (handles migrating from old config)
    return {
      colors: config.colors ?? defaultConfig.colors,
      theme: config.theme ?? defaultConfig.theme
    };
  } catch (error) {
    console.error('Error loading configuration:', error);
    return defaultConfig;
  }
}

// Save configuration
export function saveConfig(config: Config): void {
  try {
    ensureDataDirectoryExists();
    fs.writeFileSync(getConfigFilePath(), JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving configuration:', error);
  }
}

// Get a specific configuration setting
export function getConfigSetting(key: string): any {
  const config = loadConfig();
  if (key === 'colors' || key === 'theme') {
    return config[key as keyof Config];
  }
  console.error(`Unknown configuration key: ${key}`);
  return null;
}

// Set a specific configuration setting
export function setConfigSetting(key: string, value: any): void {
  const config = loadConfig();
  if (key === 'colors' || key === 'theme') {
    // Type validation
    if (key === 'colors' && typeof value !== 'boolean') {
      value = value === 'true';
    }
    // Set the value with proper type assertion
    (config as any)[key] = value;
    saveConfig(config);
  } else {
    console.error(`Unknown configuration key: ${key}`);
  }
}

// Display current configuration
export function displayConfig(): void {
  const config = loadConfig();
  console.log('Current Configuration:');
  console.log('─────────────────────────');
  Object.entries(config).forEach(([key, value]) => {
    console.log(`${key.padEnd(12)} : ${value}`);
  });
}

/**
 * Check if colors are enabled in configuration
 */
let colorEnabledCache: boolean | null = null;
let lastConfigCheck = 0;

export function isColorEnabled(): boolean {
  const now = Date.now();
  if (colorEnabledCache === null || now - lastConfigCheck > 5000) {
    colorEnabledCache = loadConfig().colors !== false;
    lastConfigCheck = now;
  }
  return colorEnabledCache;
}