/**
 * Formatting utilities for CodexCLI
 * 
 * This module provides functions for styling console output with colors,
 * formatting data in consistent ways, and generating help text.
 * It uses the chalk library for terminal styling.
 */
import chalk from 'chalk';
import { getDataFilePath, isDev } from './utils/paths';
import path from 'path';
import { getAliasesForPath } from './alias';
import { isColorEnabled } from './config';

// Helper function to use chalk only when colors are enabled
export const color = {
  cyan: (text: string) => isColorEnabled() ? chalk.cyan(text) : text,
  green: (text: string) => isColorEnabled() ? chalk.green(text) : text,
  yellow: (text: string) => isColorEnabled() ? chalk.yellow(text) : text,
  red: (text: string) => isColorEnabled() ? chalk.red(text) : text,
  blue: (text: string) => isColorEnabled() ? chalk.blue(text) : text,
  magenta: (text: string) => isColorEnabled() ? chalk.magenta(text) : text,
  gray: (text: string) => isColorEnabled() ? chalk.gray(text) : text,
  white: (text: string) => isColorEnabled() ? chalk.white(text) : text,
  italic: (text: string) => isColorEnabled() ? chalk.italic(text) : text,
  bold: {
    cyan: (text: string) => isColorEnabled() ? chalk.bold.cyan(text) : text,
    green: (text: string) => isColorEnabled() ? chalk.bold.green(text) : text,
    yellow: (text: string) => isColorEnabled() ? chalk.bold.yellow(text) : text,
    blue: (text: string) => isColorEnabled() ? chalk.bold.blue(text) : text,
    magenta: (text: string) => isColorEnabled() ? chalk.bold.magenta(text) : text,
  }
};

/**
 * Format and output data with colors based on nesting level
 * 
 * Takes any data object and formats it as JSON with indentation
 * 
 * @param {any} data - The data object to format and display
 */
export function formatOutput(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Display key-value pairs with colored keys based on nesting level
 * 
 * Uses different colors for each level of a nested key (separated by dots)
 * to improve readability in hierarchical data
 * 
 * @param {string} key - The key to format (may contain dots for nesting)
 * @param {string} value - The value to display
 */
export function formatKeyValue(key: string, value: string): void {
  // Split the key by dots to get levels
  const parts = key.split('.');
  
  // Color palette for different levels
  const colors = [
    color.cyan,     // Level 0 (base keys)
    color.green,    // Level 1
    color.yellow,   // Level 2
    color.magenta,  // Level 3
    color.blue,     // Level 4
    color.red       // Level 5 and beyond
  ];
  
  // Start building the colored string
  let coloredKey = '';
  
  // Apply color to each part based on its level
  parts.forEach((part, index) => {
    // Choose color based on level (use last color for deeper levels)
    const colorFn = colors[Math.min(index, colors.length - 1)];
    
    // Add the part with appropriate color
    coloredKey += colorFn(part);
    
    // Add dot separator if not the last part
    if (index < parts.length - 1) {
      coloredKey += color.white('.');
    }
  });
  
  // Display the full colored key with its value
  console.log(`${coloredKey}: ${value}`);
}

/**
 * Display a colorful help message
 * 
 * Generates and prints a formatted help screen with command usage,
 * available commands, examples, and data storage location.
 * Uses color coding to improve readability and visual appeal.
 */
export function showHelp(): void {
  console.log();
  console.log('┌───────────────────────────────────────────┐');
  console.log('│ CodexCLI - Command Line Information Store │');
  console.log('└───────────────────────────────────────────┘');
  console.log();
  console.log('USAGE:');
  console.log('  ccli <command> [parameters] [options]');
  console.log();
  console.log('COMMANDS:');
  console.log('  add        <key> <value>              Add or update an entry');
  console.log('  get        <key>                      Retrieve an entry');
  console.log('  list       [path]                     List all entries or entries under specified path');
  console.log('  find       <term>                     Find entries by key or value');
  console.log('  remove     <key>                      Remove an entry');
  console.log('  alias      <action> [name] [path]     Manage aliases for paths');
  console.log('  config     [setting] [value]          View or change configuration settings');
  console.log('  export     <type>                     Export data or aliases to a file');
  console.log('  import     <type> <file>              Import data or aliases from a file');
  console.log('  reset      <type>                     Reset data or aliases to empty state');
  console.log('  examples                              Initialize with example data');
  console.log('  help                                  Show this help message');

  // Rest of the function remains the same
  
  // Options section - NEW
  console.log('\n' + color.bold.magenta('OPTIONS:'));
  console.log(`  ${color.yellow('--tree')}     Display data in a hierarchical tree structure`);
  console.log(`  ${color.yellow('--raw')}      Output raw values without formatting (for scripting)`);
  console.log(`  ${color.yellow('--debug')}    Enable debug output for troubleshooting\n`);
  
  // Examples section
  console.log(color.bold.magenta('EXAMPLES:'));
  console.log(`  ${color.yellow('ccli')} ${color.green('add')} ${color.cyan('server.ip')} 192.168.1.100`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('server.ip')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('list')} ${color.cyan('server')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('list')} ${color.cyan('--tree')}             ${color.gray('# Display all data as a tree')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('find')} 192.168.1.100\n`);
  
  // Alias examples
  console.log(`  ${color.yellow('ccli')} ${color.green('alias')} ${color.cyan('set myalias server.production.ip')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('myalias')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('alias')} ${color.cyan('list')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('alias')} ${color.cyan('remove myalias')}\n`);
  
  // Tree view example - NEW
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('server')} ${color.yellow('--tree')}    ${color.gray('# Display server info as a tree')}\n`);
  
  // Example data initialization - NEW
  console.log(`  ${color.yellow('ccli')} ${color.green('examples')} ${color.yellow('--force')}     ${color.gray('# Initialize with example data')}`);
  
  // Add examples for the new commands
  console.log(`  ${color.yellow('ccli')} ${color.green('export')} ${color.cyan('data')} ${color.yellow('-o')} backup.json       ${color.gray('# Export data to a file')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('import')} ${color.cyan('all')} backup.json ${color.yellow('--merge')}   ${color.gray('# Import and merge data')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('reset')} ${color.cyan('aliases')} ${color.yellow('--force')}            ${color.gray('# Reset aliases to empty state')}\n`);
  
  // Config examples - NEW
  console.log(`  ${color.yellow('ccli')} ${color.green('config')}                  ${color.gray('# View all current settings')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('config')} ${color.cyan('colors false')}     ${color.gray('# Disable colored output')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('config')} ${color.cyan('--list')}           ${color.gray('# List available settings')}\n`);
  
  // Data file location section
  const DATA_FILE = getDataFilePath();
  const ALIAS_FILE = path.join(path.dirname(DATA_FILE), 'aliases.json');
  const envLabel = isDev() ? color.yellow('[DEV] ') : '';
  
  console.log(color.bold.magenta('DATA STORAGE:'));
  console.log(`  ${envLabel}${color.white('Entries are stored in:      ')} ${color.cyan(DATA_FILE)}`);
  console.log(`  ${envLabel}${color.white('Aliases are stored in:      ')} ${color.cyan(ALIAS_FILE)}\n`);
}

/**
 * Displays an object in a tree-like structure
 */
export function displayTree(
  obj: any,
  prefix: string = '',
  currentPath: string = ''
): void {
  if (prefix === '') console.log();
  
  Object.keys(obj).forEach((key, index) => {
    const newPath = currentPath ? `${currentPath}.${key}` : key;
    const isLastEntry = index === Object.keys(obj).length - 1;
    const aliases = getAliasesForPath(newPath);
    const aliasDisplay = aliases.length > 0 ? color.blue(` (${aliases.join(', ')})`) : '';
    const branch = isLastEntry ? '└── ' : '├── ';
    const value = obj[key];
    const isObject = typeof value === 'object' && value !== null;
    const keyDisplay = isObject ? color.bold.green(key) : color.green(key);
    
    console.log(`${prefix}${branch}${keyDisplay}${aliasDisplay}`);
    
    if (isObject) {
      displayTree(value, prefix + (isLastEntry ? '    ' : '│   '), newPath);
    } else {
      const valueDisplay = value === null ? color.italic('null') : value.toString();
      console.log(`${prefix}${isLastEntry ? '    ' : '│   '}└── ${valueDisplay}`);
    }
  });
}