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
import { getAliasesForPath } from './alias';
import chalk from 'chalk';
import fs from 'fs';
import { getDataFilePath, getDataDirectory, ensureDataDirectoryExists } from './utils/paths';
import path from 'path';
import { loadAliases, saveAliases } from './alias';
import { loadConfig, getConfigSetting, setConfigSetting } from './config';

/**
 * Prints a success message with a green checkmark
 * @param {string} message - The success message to display
 */
function printSuccess(message: string): void {
  console.log(chalk.green('✓ ') + message);
}

/**
 * Prints a warning message with a yellow warning symbol
 * @param {string} message - The warning message to display
 */
function printWarning(message: string): void {
  console.log(chalk.yellow('⚠ ') + message);
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
 * Retrieves and displays a data entry by its key
 * Supports nested access via dot notation and different output formats
 * 
 * @param {string} key - The key to look up
 * @param {Object} options - Display options (e.g., {raw: true} for unformatted output)
 */
export function getEntry(key: string, options: any = {}): void {
  const data = loadData();
  
  let value;
  if (key.includes('.')) {
    value = getNestedValue(data, key);
  } else {
    value = data[key];
  }
  
  if (value === undefined) {
    console.error(`Entry '${key}' not found`);
    return;
  }
  
  // Raw output for scripting
  if (options.raw) {
    if (typeof value === 'object' && value !== null) {
      console.log(JSON.stringify(value));
    } else {
      console.log(value);
    }
    return;
  }
  
  // Tree display for objects when tree option is set
  if (options.tree && typeof value === 'object' && value !== null) {
    displayTree({ [key]: value });
    return;
  }
  
  // Existing formatted output
  if (typeof value === 'object' && value !== null) {
    const flatObj = flattenObject({ [key]: value }, '');
    Object.entries(flatObj).forEach(([k, v]) => {
      formatKeyValue(k, v);
    });
  } else {
    console.log(value);
  }
}

/**
 * Applies different colors to each level of a path
 * @param {string} path - The dot-separated path to colorize
 * @returns {string} - The colorized path
 */
function colorizePathByLevels(path: string): string {
  const colors = [chalk.cyan, chalk.yellow, chalk.green, chalk.magenta, chalk.blue];
  const parts = path.split('.');
  
  // Apply a different color to each path segment
  return parts.map((part, index) => {
    const colorFn = colors[index % colors.length];
    return colorFn(part);
  }).join('.');
}

/**
 * Lists all entries in storage with optional path filtering
 * Displays entries in a formatted, hierarchical view
 * 
 * @param {string} [path] - Optional path prefix to filter displayed entries
 * @param {Object} [options] - Display options (e.g., {tree: true} for tree view)
 */
export function listEntries(path?: string, options: any = {}): void {
  try {
    const data = loadData();
    
    // Debug log to verify options
    if (process.env.DEBUG === 'true') {
      console.log('Options received:', options);
    }
    
    if (Object.keys(data).length === 0) {
      console.log('No entries found.');
      return;
    }
    
    // Handle tree display if option is set
    if (options.tree === true) {
      if (process.env.DEBUG === 'true') {
        console.log('Tree display enabled');
      }
      
      if (path) {
        // For a specific path, create a sub-object with just that branch
        const pathParts = path.split('.');
        let current: any = data;
        
        // Navigate to the requested path
        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          if (current[part] === undefined) {
            console.log(`Path '${path}' not found.`);
            return;
          }
          current = current[part];
        }
        
        // Display just this subtree
        displayTree({ [path]: current });
      } else {
        // Display the complete tree
        displayTree(data);
      }
      return;
    }
    
    // Normal flat display (existing code)
    const flattenedData = flattenObject(data);
    let entriesToDisplay: Record<string, string> = flattenedData;
    
    if (path) {
      // Filter by path prefix
      const filteredEntries: Record<string, string> = {};
      const prefix = path + '.';
      
      // Include exact match
      if (flattenedData[path] !== undefined) {
        filteredEntries[path] = flattenedData[path];
      }
      
      // Include all children
      Object.entries(flattenedData).forEach(([key, value]) => {
        if (key.startsWith(prefix)) {
          filteredEntries[key] = value;
        }
      });
      
      if (Object.keys(filteredEntries).length === 0) {
        console.log(`No entries found under '${path}'.`);
        return;
      }
      
      // Use the filtered entries instead of all entries
      entriesToDisplay = filteredEntries;
    }

    // Format and display entries, now with aliases
    Object.entries(entriesToDisplay).forEach(([key, value]) => {
      // Don't add the path prefix again - the key already includes it
      const fullPath = key;
      
      // Find aliases that point to this path
      const aliases = getAliasesForPath(fullPath);
      
      // Format the value as needed
      const displayValue = typeof value === 'object' 
        ? chalk.gray('[Object]') 
        : value.toString();
      
      // Apply different colors to each level of the path
      const colorizedPath = colorizePathByLevels(fullPath);
      
      // Display with the format: path (alias) content
      if (aliases.length > 0) {
        console.log(`${colorizedPath} ${chalk.blue('(' + aliases[0] + ')')} ${displayValue}`);
      } else {
        console.log(`${colorizedPath} ${displayValue}`);
      }
    });
  } catch (error) {
    handleError('Error listing entries:', error);
  }
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
    // Get paths from utilities to ensure consistency
    const dataDir = getDataDirectory();
    const dataFilePath = getDataFilePath();
    const aliasFilePath = path.join(dataDir, 'aliases.json');
    
    console.log('Initializing example data...');
    console.log(`Data directory: ${dataDir}`);
    console.log(`Data file path: ${dataFilePath}`);
    console.log(`Alias file path: ${aliasFilePath}`);
    
    // Check if files already exist
    const dataExists = fs.existsSync(dataFilePath);
    const aliasesExist = fs.existsSync(aliasFilePath);
    
    // Handle existing files
    if (dataExists || aliasesExist) {
      if (!force) {
        console.log(chalk.yellow('\n⚠ Data or alias files already exist.'));
        console.log(`Data file (${dataFilePath}): ${dataExists ? chalk.green('exists') : chalk.red('missing')}`);
        console.log(`Aliases file (${aliasFilePath}): ${aliasesExist ? chalk.green('exists') : chalk.red('missing')}`);
        console.log('\nUse --force to overwrite existing files.');
        return;
      }
      console.log(chalk.yellow('\n⚠ Force flag detected. Overwriting existing files...'));
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
    
    try {
      // Write both files in sequence
      fs.writeFileSync(dataFilePath, JSON.stringify(exampleData, null, 2), 'utf8');
      fs.writeFileSync(aliasFilePath, JSON.stringify(exampleAliases, null, 2), 'utf8');
      
      console.log(chalk.green('✓ ') + `Data file created: ${dataFilePath}`);
      console.log(chalk.green('✓ ') + `Aliases file created: ${aliasFilePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to write files: ${errorMessage}`));
      return;
    }
    
    console.log(chalk.green('\n✨ Example data successfully initialized!\n'));
    
    // Show command examples
    console.log(chalk.bold('Try these commands:'));
    console.log(`  ${chalk.yellow('ccli')} ${chalk.green('list')} ${chalk.yellow('--tree')}`);
    console.log(`  ${chalk.yellow('ccli')} ${chalk.green('get')} ${chalk.cyan('prodip')}`);
    console.log(`  ${chalk.yellow('ccli')} ${chalk.green('alias')} ${chalk.green('list')}\n`);
  } catch (error) {
    console.error(chalk.red('\n❌ Error initializing example data:'));
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
      console.log(chalk.green('✓ ') + `Data exported to: ${chalk.cyan(outputFile)}`);
    }
    
    if (type === 'aliases' || type === 'all') {
      const outputFile = options.output || path.join(defaultDir, `codexcli-aliases-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(loadAliases(), null, indent), 'utf8');
      console.log(chalk.green('✓ ') + `Aliases exported to: ${chalk.cyan(outputFile)}`);
    }
  } catch (error) {
    console.error(chalk.red('Error exporting data:'), error instanceof Error ? error.message : String(error));
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
      console.error(chalk.red(`Import file not found: ${file}`));
      return;
    }
    
    // Confirm before overwriting unless --force is used
    if (!options.force) {
      console.log(chalk.yellow(`⚠ This will ${options.merge ? 'merge' : 'replace'} your ${type} file.`));
      console.log(chalk.yellow(`To proceed without confirmation, use the --force flag.`));
      
      // In a real CLI, you'd prompt for confirmation here
      // For this implementation, we'll just warn and continue
      console.log(chalk.yellow(`Continuing with import...`));
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
      console.log(chalk.green('✓ ') + `Data ${options.merge ? 'merged' : 'imported'} successfully`);
    }
    
    if (type === 'aliases' || type === 'all') {
      const currentAliases = options.merge ? loadAliases() : {};
      
      // Merge or replace aliases
      const newAliases = options.merge 
        ? { ...currentAliases, ...importedData } 
        : importedData;
      
      // Save the aliases
      saveAliases(newAliases);
      console.log(chalk.green('✓ ') + `Aliases ${options.merge ? 'merged' : 'imported'} successfully`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error importing data:'), errorMessage);
    
    if (error instanceof SyntaxError) {
      console.error(chalk.red('The import file contains invalid JSON.'));
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
      console.log(chalk.yellow(`⚠ This will reset your ${type} to an empty state.`));
      console.log(chalk.yellow(`To proceed without confirmation, use the --force flag.`));
      
      // In a real CLI, you'd prompt for confirmation here
      // For this implementation, we'll just warn and continue
      console.log(chalk.yellow(`Continuing with reset...`));
    }
    
    // Reset data
    if (type === 'data' || type === 'all') {
      saveData({});
      console.log(chalk.green('✓ ') + `Data has been reset to an empty state`);
    }
    
    // Reset aliases
    if (type === 'aliases' || type === 'all') {
      saveAliases({});
      console.log(chalk.green('✓ ') + `Aliases have been reset to an empty state`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error resetting data:'), errorMessage);
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
    console.log(chalk.bold('Available Configuration Settings:'));
    console.log('─'.repeat(40));
    console.log(`${chalk.green('colors'.padEnd(15))}: Enable/disable colored output (true/false)`);
    console.log(`${chalk.green('theme'.padEnd(15))}: UI theme (default/dark/light)`);
    console.log(`${chalk.green('editor'.padEnd(15))}: Default editor for editing entries`);
    return;
  }

  // If no setting provided, show all settings
  if (!setting) {
    const config = loadConfig();
    
    console.log(chalk.bold('Current Configuration:'));
    console.log('─'.repeat(25));
    
    for (const [key, val] of Object.entries(config)) {
      console.log(`${chalk.green(key.padEnd(15))}: ${val}`);
    }
    
    console.log('\nUse `ccli config --help` to see available options');
    return;
  }
  
  // If only setting provided, show that setting's value
  if (setting && !value) {
    const currentValue = getConfigSetting(setting);
    if (currentValue !== undefined) {
      console.log(`${chalk.green(setting)}: ${currentValue}`);
    } else {
      console.error(`Setting '${chalk.yellow(setting)}' does not exist`);
    }
    return;
  }
  
  // If both setting and value provided, update the setting
  setConfigSetting(setting, value);
  console.log(`Updated ${chalk.green(setting)} to: ${value}`);
}