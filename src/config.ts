/**
 * Configuration management for CodexCLI
 */
import fs from 'fs';
import { getConfigFilePath, ensureDataDirectoryExists } from './utils/paths';

// Available settings and their default values
const DEFAULT_CONFIG = {
  colorEnabled: true,
  indentSize: 2,
  defaultFormat: 'pretty'
};

type Config = typeof DEFAULT_CONFIG;

/**
 * Load configuration settings
 */
export function loadConfig(): Config {
  try {
    const configPath = getConfigFilePath();
    
    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_CONFIG };
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    
    if (!configData.trim()) {
      return { ...DEFAULT_CONFIG };
    }
    
    return { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
  } catch (error) {
    console.error('Error loading configuration:', 
      error instanceof Error ? error.message : String(error));
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration settings
 */
export function saveConfig(config: Partial<Config>): boolean {
  try {
    const configPath = getConfigFilePath();
    ensureDataDirectoryExists();
    
    // Merge with existing config if any
    const existingConfig = loadConfig();
    const newConfig = { ...existingConfig, ...config };
    
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving configuration:', 
      error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Get a specific configuration setting
 */
export function getConfigSetting(setting: string): any {
  const config = loadConfig();
  return config[setting as keyof Config];
}

/**
 * Set a configuration setting
 */
export function setConfigSetting(setting: string, value: any): boolean {
  const config = loadConfig();
  
  if (!(setting in config)) {
    console.error(`Unknown configuration setting: ${setting}`);
    console.log('Available settings:');
    Object.keys(DEFAULT_CONFIG).forEach(key => {
      console.log(`  ${key}`);
    });
    return false;
  }
  
  // Convert value to appropriate type
  const currentValue = config[setting as keyof Config];
  
  let typedValue: any;
  if (typeof currentValue === 'boolean') {
    typedValue = value === 'true' || value === true;
  } else if (typeof currentValue === 'number') {
    typedValue = Number(value);
  } else {
    typedValue = value;
  }
  
  // Update the setting
  const updatedConfig = { 
    [setting]: typedValue 
  };
  
  return saveConfig(updatedConfig);
}

/**
 * Check if colors are enabled in configuration
 */
export function isColorEnabled(): boolean {
  return getConfigSetting('colorEnabled') !== false;
}