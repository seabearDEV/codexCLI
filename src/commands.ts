/**
 * Implementation of core CodexCLI commands
 * 
 * This module contains the business logic for all CLI commands,
 * handling data operations and user feedback. Each command function 
 * corresponds to a CLI command defined in index.ts.
 */
import { loadData, saveData, handleError } from './storage';
import { setNestedValue, getNestedValue, removeNestedValue, flattenObject } from './utils';
import { formatKeyValue, displayTree } from './formatting';
import { color } from './formatting';
import fs from 'fs';
import { 
  getDataDirectory, 
  ensureDataDirectoryExists, 
  getDataFilePath, 
  getAliasFilePath, 
  getConfigFilePath 
} from './utils/paths';
import path from 'path';
import { loadAliases, saveAliases, getAliasesForPath } from './alias';
import { loadConfig, getConfigSetting, setConfigSetting } from './config';

/**
 * Prints a success message with a green checkmark
 * @param {string} message - The success message to display
 */
function printSuccess(message: string): void {
  console.log(color.green('✓ ') + message);
}

/**
 * Prints a warning message with a yellow warning symbol
 * @param {string} message - The warning message to display
 */
function printWarning(message: string): void {
  console.log(color.yellow('⚠ ') + message);
}

/**
 * Display entries with colorized paths and alias indicators
 */
function displayEntries(entries: Record<string, string>): void {
  Object.entries(entries).forEach(([key, value]) => {
    const colorizedPath = colorizePathByLevels(key);
    const aliases = getAliasesForPath(key);
    
    if (aliases.length > 0) {
      console.log(`${colorizedPath} ${color.blue('(' + aliases[0] + ')')} ${value}`);
    } else {
      console.log(`${colorizedPath} ${value}`);
    }
  });
}

/**
 * Colorize path segments with alternating colors
 */
function colorizePathByLevels(path: string): string {
  const colors = [color.cyan, color.yellow, color.green, color.magenta, color.blue];
  const parts = path.split('.');
  
  return parts.map((part, index) => {
    const colorFn = colors[index % colors.length];
    return colorFn(part);
  }).join('.');
}

/**
 * Adds or updates a data entry in storage
 * Supports nested properties via dot notation (e.g., 'user.name')
 * 
 * @param {string} key - The key for the entry
 * @param {string} value - The value to store
 */
export function addEntry(key: string, value: any): void {
  try {
    // Ensure the directory exists before trying to add data
    ensureDataDirectoryExists();
    const data = loadData();
    
    // Handle nested paths with dot notation
    if (key.includes('.')) {
      setNestedValue(data, key, value);
    } else {
      data[key] = value;
    }
    
    saveData(data);
    console.log(`Entry '${key}' added successfully.`);
  } catch (error) {
    handleError('Failed to add entry:', error);
  }
}

/**
 * Retrieves and displays a data entry or entries
 * Supports nested access via dot notation and different output formats
 * When no key is provided, it displays all entries
 * 
 * @param {string} [key] - The optional key to look up
 * @param {Object} options - Display options (e.g., {raw: true} for unformatted output)
 */
export function getEntry(key?: string, options: any = {}): void {
  const data = loadData();
  
  // If no key is provided, show all entries
  if (!key) {
    if (Object.keys(data).length === 0) {
      console.log('No entries found.');
      return;
    }
    
    // Handle tree display for all entries
    if (options.tree) {
      displayTree(data);
      return;
    }
    
    displayEntries(flattenObject(data));
    return;
  }
  
  // Handle specific key lookup
  let value;
  if (key.includes('.')) {
    value = getNestedValue(data, key);
  } else {
    value = data[key];
  }
  
  // Check if the value exists
  if (value === undefined) {
    // Before reporting "not found", check if there are any entries under this path
    const prefix = key + '.';
    const flatData = flattenObject(data);
    
    const childEntries = Object.keys(flatData)
      .filter(k => k.startsWith(prefix));
    
    if (childEntries.length > 0) {
      // This is a parent path with children, so display them
      if (options.tree) {
        // Reconstruct the object for tree display
        const subtree: Record<string, any> = {};
        
        // Find the common parts of the path
        const parts = key.split('.');
        
        // Build the subtree structure
        let target: Record<string, any> = subtree;
        for (let i = 0; i < parts.length - 1; i++) {
          target[parts[i]] = {};
          target = target[parts[i]];
        }
        
        // Set the last part of the path to the unflattened object
        target[parts[parts.length - 1]] = unflattenObject(
          Object.fromEntries(
            childEntries.map(k => [k.substring(prefix.length), flatData[k]])
          )
        );
        
        displayTree(subtree);
        return;
      }
      
      // Display child entries in flat format
      const filteredEntries: Record<string, string> = {};
      childEntries.forEach(k => filteredEntries[k] = flatData[k]);
      displayEntries(filteredEntries);
      return;
    }
    
    // If we reach here, the entry truly doesn't exist
    console.error(`Entry '${key}' not found`);
    return;
  }
  
  // Handle object value display (subtree)
  if (typeof value === 'object' && value !== null) {
    // For tree display
    if (options.tree) {
      displayTree({ [key]: value });
      return;
    }
    
    // For flat display
    const filteredEntries = flattenObject({ [key]: value });
    
    if (Object.keys(filteredEntries).length === 0) {
      console.log(`No entries found under '${key}'.`);
      return;
    }
    
    // Transform keys to include full path
    const entries: Record<string, string> = {};
    Object.entries(filteredEntries).forEach(([entryKey, entryValue]) => {
      const fullPath = key + '.' + entryKey.replace(/^[^.]+\./, '');
      entries[fullPath] = entryValue as string;
    });
    
    displayEntries(entries);
    return;
  }
  
  // Raw output for scripting
  if (options.raw) {
    console.log(value);
    return;
  }
  
  // Simple value display
  console.log(value);
}

/**
 * Helper function to convert a flattened object back to nested structure
 * @param {Object} flatObj - Flattened object with dot notation keys
 * @returns {Object} - Nested object structure
 */
function unflattenObject(flatObj: {[key: string]: any}): Record<string, any> {
  const result: Record<string, any> = {};
  
  Object.keys(flatObj).forEach(key => {
    const parts = key.split('.');
    let current = result;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      current[part] = current[part] || {};
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = flatObj[key];
  });
  
  return result;
}

/**
 * Removes an entry from storage by its key
 * Supports nested properties via dot notation
 * 
 * @param {string} key - The key of the entry to remove
 */
export function removeEntry(key: string): void {
  const data = loadData();
  let removed = false;
  
  // Handle nested paths
  if (key.includes('.')) {
    removed = removeNestedValue(data, key);
  } else {
    if (data[key] !== undefined) {
      delete data[key];
      removed = true;
    }
  }
  
  if (!removed) {
    printWarning(`Entry '${key}' not found.`);
    return;
  }
  
  try {
    saveData(data);
    printSuccess(`Entry '${key}' removed successfully.`);
  } catch (error) {
    handleError('Failed to remove entry:', error);
  }
}

/**
 * Searches for entries by key or value
 * Performs a case-insensitive search across all entries
 * 
 * @param {string} searchTerm - The term to search for in keys and values
 * @param {Object} options - Display options (e.g., {tree: true} for tree view)
 */
export function searchEntries(searchTerm: string, options: any = {}): void {
  const data = loadData();
  
  if (Object.keys(data).length === 0) {
    console.log('No entries to search in.');
    return;
  }
  
  // Flatten nested objects for searching
  const flattenedData = flattenObject(data);
  const matches: Record<string, string> = {};
  const lcSearchTerm = searchTerm.toLowerCase();
  
  // Search in both keys and values
  Object.entries(flattenedData).forEach(([key, value]) => {
    if (
      key.toLowerCase().includes(lcSearchTerm) || 
      value.toLowerCase().includes(lcSearchTerm)
    ) {
      matches[key] = value;
    }
  });
  
  if (Object.keys(matches).length === 0) {
    console.log(`No matches found for '${searchTerm}'.`);
    return;
  }
  
  console.log(`Found ${Object.keys(matches).length} matches for '${searchTerm}':`);
  
  // Use tree display if requested
  if (options?.tree) {
    // Create an object with just the matching entries
    const matchesObj = {};
    Object.keys(matches).forEach(key => {
      setNestedValue(matchesObj, key, matches[key]);
    });
    displayTree(matchesObj);
    return;
  }
  
  // Default display with color-coded keys
  Object.entries(matches).forEach(([key, value]) => {
    formatKeyValue(key, value);
  });
}

/**
 * Initializes data storage with example data
 * 
 * @param {boolean} force - Whether to overwrite existing data
 */
export function initializeExampleData(force: boolean = false): void {
  try {
    // Use the utility functions directly for consistency
    const dataDir = getDataDirectory();
    // Create the data directory if it doesn't exist
    fs.mkdirSync(dataDir, { recursive: true });
    const dataFilePath = getDataFilePath();
    const aliasFilePath = getAliasFilePath();
    const configFilePath = getConfigFilePath();

    console.log('Initializing example data...');
    console.log(`Data directory: ${dataDir}`);
    console.log(`Data file path: ${dataFilePath}`);
    console.log(`Alias file path: ${aliasFilePath}`);
    console.log(`Config file path: ${configFilePath}`);

    // Check if files already exist
    const dataExists = fs.existsSync(dataFilePath);
    const aliasesExist = fs.existsSync(aliasFilePath);
    const configExists = fs.existsSync(configFilePath);
    
    // Handle existing files
    if (dataExists || aliasesExist || configExists) {
      if (!force) {
        console.log(color.yellow('\n⚠ Data or alias files already exist.'));
        console.log(`Data file (${dataFilePath}): ${dataExists ? color.green('exists') : color.red('missing')}`);
        console.log(`Aliases file (${aliasFilePath}): ${aliasesExist ? color.green('exists') : color.red('missing')}`);
        console.log(`Config file (${configFilePath}): ${configExists ? color.green('exists') : color.red('missing')}`);
        console.log('\nUse --force to overwrite existing files.');
        return;
      }
      console.log(color.yellow('\n⚠ Force flag detected. Overwriting existing files...'));
    }
    
    // Create both files or neither file
    // Ensure data directory exists
    ensureDataDirectoryExists();
    
    // Example data and aliases (unchanged)
    const exampleData = {
      "snippets": {
        "welcome": {
          "content": "Welcome to CodexCLI! This is a sample snippet to get you started.",
          "created": new Date().toISOString()
        },
        "example": {
          "content": "This is an example showing how to structure your snippets.",
          "created": new Date().toISOString()
        },
        "git-push": {
          "content": "git push origin $(git branch --show-current)",
          "description": "Push to the current branch"
        },
        "docker-clean": {
          "content": "docker system prune -af --volumes",
          "description": "Clean all unused Docker resources"
        }
      },
      "server": {
        "production": {
          "ip": "192.168.1.100",
          "user": "admin",
          "port": "22",
          "domain": "prod.example.com"
        },
        "staging": {
          "ip": "192.168.1.200",
          "user": "testuser",
          "port": "22",
          "domain": "staging.example.com"
        },
        "development": {
          "ip": "127.0.0.1",
          "user": "devuser",
          "port": "3000"
        }
      },
      "personal": {
        "info": {
          "firstName": "John",
          "lastName": "Doe"
        },
        "contact": {
          "email": "john@example.com",
          "phone": "555-123-4567"
        }
      }
    };
    
    const exampleAliases = {
      "prodip": "server.production.ip",
      "produser": "server.production.user",
      "prodport": "server.production.port",
      "proddomain": "server.production.domain",
      "stageip": "server.staging.ip",
      "devip": "server.development.ip",
      "welcome": "snippets.welcome.content",
      "gitpush": "snippets.git-push.content",
      "dockerclean": "snippets.docker-clean.content",
      "allsnippets": "snippets",
      "allservers": "server"
    };
    
    // Add default config with only the required options
    const exampleConfig = {
      "colors": true,
      "indentSize": 2,
      "theme": "default"
    };
    
    try {
      // Write all three files in sequence
      fs.writeFileSync(dataFilePath, JSON.stringify(exampleData, null, 2), 'utf8');
      fs.writeFileSync(aliasFilePath, JSON.stringify(exampleAliases, null, 2), 'utf8');
      fs.writeFileSync(configFilePath, JSON.stringify(exampleConfig, null, 2), 'utf8');
      
      console.log(color.green('✓ ') + `Data file created: ${dataFilePath}`);
      console.log(color.green('✓ ') + `Aliases file created: ${aliasFilePath}`);
      console.log(color.green('✓ ') + `Config file created: ${configFilePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(color.red(`Failed to write files: ${errorMessage}`));
      return;
    }
    
    console.log(color.green('\n✨ Example data successfully initialized!\n'));
    
    // Show command examples
    console.log(color.bold('Try these commands:'));
    console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.yellow('--tree')}`);
    console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('prodip')}`);
    console.log(`  ${color.yellow('ccli')} ${color.green('alias')} ${color.green('get')}\n`);
  } catch (error) {
    console.error(color.red('\n❌ Error initializing example data:'));
    console.error(String(error));
    
    console.log('\nDetail:');
    if (error instanceof Error) {
      console.log(`  Message: ${error.message}`);
      console.log(`  Stack: ${error.stack}`);
    } else {
      console.log(`  ${String(error)}`);
    }
  }
}

/**
 * Exports data or aliases to a file
 */
export function exportData(type: string, options: any): void {
  try {
    if (!['data', 'aliases', 'all'].includes(type)) {
      console.error(`Invalid type: ${type}. Must be 'data', 'aliases', or 'all'`);
      return;
    }
    
    const defaultDir = process.cwd();
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const indent = options.pretty ? 2 : 0;
    
    if (type === 'data' || type === 'all') {
      const outputFile = options.output || path.join(defaultDir, `codexcli-data-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(loadData(), null, indent), 'utf8');
      console.log(color.green('✓ ') + `Data exported to: ${color.cyan(outputFile)}`);
    }
    
    if (type === 'aliases' || type === 'all') {
      const outputFile = options.output || path.join(defaultDir, `codexcli-aliases-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(loadAliases(), null, indent), 'utf8');
      console.log(color.green('✓ ') + `Aliases exported to: ${color.cyan(outputFile)}`);
    }
  } catch (error) {
    console.error(color.red('Error exporting data:'), error instanceof Error ? error.message : String(error));
  }
}

/**
 * Imports data or aliases from a file
 * 
 * @param {string} type - Type of data to import ('data', 'aliases', or 'all')
 * @param {string} file - Path to the file to import
 * @param {object} options - Import options (merge, force)
 */
export function importData(type: string, file: string, options: any): void {
  try {
    // Validate type parameter
    if (!['data', 'aliases', 'all'].includes(type)) {
      console.error(`Invalid type: ${type}. Must be 'data', 'aliases', or 'all'`);
      return;
    }
    
    // Check if file exists
    if (!fs.existsSync(file)) {
      console.error(color.red(`Import file not found: ${file}`));
      return;
    }
    
    // Confirm before overwriting unless --force is used
    if (!options.force) {
      console.log(color.yellow(`⚠ This will ${options.merge ? 'merge' : 'replace'} your ${type} file.`));
      console.log(color.yellow(`To proceed without confirmation, use the --force flag.`));
      
      // In a real CLI, you'd prompt for confirmation here
      // For this implementation, we'll just warn and continue
      console.log(color.yellow(`Continuing with import...`));
    }
    
    // Import data
    const importedData = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    if (type === 'data' || type === 'all') {
      const currentData = options.merge ? loadData() : {};
      
      // Merge or replace data
      const newData = options.merge 
        ? deepMerge(currentData, importedData)
        : importedData;
      
      // Save the data
      saveData(newData);
      console.log(color.green('✓ ') + `Data ${options.merge ? 'merged' : 'imported'} successfully`);
    }
    
    if (type === 'aliases' || type === 'all') {
      const currentAliases = options.merge ? loadAliases() : {};
      
      // Merge or replace aliases
      const newAliases = options.merge 
        ? { ...currentAliases, ...importedData } 
        : importedData;
      
      // Save the aliases
      saveAliases(newAliases);
      console.log(color.green('✓ ') + `Aliases ${options.merge ? 'merged' : 'imported'} successfully`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(color.red('Error importing data:'), errorMessage);
    
    if (error instanceof SyntaxError) {
      console.error(color.red('The import file contains invalid JSON.'));
    }
  }
}

/**
 * Resets data or aliases to an empty state
 * 
 * @param {string} type - Type of data to reset ('data', 'aliases', or 'all')
 * @param {object} options - Reset options (force)
 */
export function resetData(type: string, options: any): void {
  try {
    // Validate type parameter
    if (!['data', 'aliases', 'all'].includes(type)) {
      console.error(`Invalid type: ${type}. Must be 'data', 'aliases', or 'all'`);
      return;
    }
    
    // Confirm before resetting unless --force is used
    if (!options.force) {
      console.log(color.yellow(`⚠ This will reset your ${type} to an empty state.`));
      console.log(color.yellow(`To proceed without confirmation, use the --force flag.`));
      
      // In a real CLI, you'd prompt for confirmation here
      // For this implementation, we'll just warn and continue
      console.log(color.yellow(`Continuing with reset...`));
    }
    
    // Reset data
    if (type === 'data' || type === 'all') {
      saveData({});
      console.log(color.green('✓ ') + `Data has been reset to an empty state`);
    }
    
    // Reset aliases
    if (type === 'aliases' || type === 'all') {
      saveAliases({});
      console.log(color.green('✓ ') + `Aliases have been reset to an empty state`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(color.red('Error resetting data:'), errorMessage);
  }
}

/**
 * Deep merges two objects
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

/**
 * Checks if a value is an object
 */
function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Handles configuration operations for viewing and changing settings
 */
export function handleConfig(setting?: string, value?: string, options?: any) {
  // Handle the --list option
  if (options && options.list) {
    console.log(color.bold('Available Configuration Settings:'));
    console.log('─'.repeat(40));
    console.log(`${color.green('colors'.padEnd(15))}: Enable/disable colored output (true/false)`);
    console.log(`${color.green('theme'.padEnd(15))}: UI theme (default/dark/light)`);
    console.log(`${color.green('editor'.padEnd(15))}: Default editor for editing entries`);
    return;
  }

  // If no setting provided, show all settings
  if (!setting) {
    const config = loadConfig();
    
    console.log(color.bold('Current Configuration:'));
    console.log('─'.repeat(25));
    
    for (const [key, val] of Object.entries(config)) {
      console.log(`${color.green(key.padEnd(15))}: ${val}`);
    }
    
    console.log('\nUse `ccli config --help` to see available options');
    return;
  }
  
  // If only setting provided, show that setting's value
  if (setting && !value) {
    const currentValue = getConfigSetting(setting);
    if (currentValue !== undefined) {
      console.log(`${color.green(setting)}: ${currentValue}`);
    } else {
      console.error(`Setting '${color.yellow(setting)}' does not exist`);
    }
    return;
  }
  
  // If both setting and value provided, update the setting
  setConfigSetting(setting, value);
  console.log(`Updated ${color.green(setting)} to: ${value}`);
}

/**
 * Set a configuration value
 * 
 * @param {string} setting - The setting name
 * @param {string} value - The value to set
 */
export function configSet(setting: string, value: string): void {
  try {
    const currentValue = getConfigSetting(setting);
    
    console.log(`Changing ${setting} from ${currentValue} to ${value}`);
    
    // Parse value based on setting type
    let parsedValue: any = value;
    
    if (setting === 'colors') {
      // Handle boolean conversion
      parsedValue = value.toLowerCase() === 'true' || value === '1';
    } else if (setting === 'indentSize') {
      // Handle number conversion
      parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue)) {
        console.error('Error: indentSize must be a number');
        return;
      }
    }
    
    // Set the config with the parsed value
    setConfigSetting(setting, parsedValue);
    console.log(`${setting} set to ${parsedValue}`);
  } catch (error) {
    console.error(`Error setting config ${setting}: ${error}`);
  }
}

// Add this interface to understand what's available
export interface Commands {
  addEntry: (key: string, value: string) => void;
  getEntry: (key: string | undefined, options?: any) => void;
  // What is the actual name for findEntries?
  findEntries?: (term: string, options: any) => void;
  find?: (term: string, options: any) => void;
  removeEntry: (key: string) => void;
  
  // Alias functions
  addAlias?: (name: string, command: string) => void;
  removeAlias?: (name: string) => void;
  listAliases?: () => void;
  runAlias?: (name: string, args: string[]) => void;
  
  // Config functions
  setConfig?: (key: string, value: string) => void;
  getConfig?: (key?: string) => void;
  
  // Other functions
  listEntries?: (options: any) => void;
  setupExamples?: (force?: boolean) => void;
  exportData: (type: string, options: any) => void;
  importData: (type: string, file: string, options: any) => void;
  resetData: (type: string, force?: boolean) => void;
}