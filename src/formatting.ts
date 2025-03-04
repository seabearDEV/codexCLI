/**
 * Formatting utilities for CodexCLI
 * 
 * This module provides functions for styling console output with colors,
 * formatting data in consistent ways, and generating help text.
 * It uses the chalk library for terminal styling.
 */
import chalk from 'chalk';
import { getDataFilePath, getAliasFilePath, getConfigFilePath } from './utils/paths';
import { loadConfig } from './config';

// Add this if you have a `formatting.ts` file with color functions
let colorConfigCache: boolean | null = null;
let lastConfigCheck = 0;

export function isColorEnabled(): boolean {
  const now = Date.now();
  // Only reload config every 5 seconds at most
  if (colorConfigCache === null || now - lastConfigCheck > 5000) {
    colorConfigCache = loadConfig().colors !== false;
    lastConfigCheck = now;
  }
  return colorConfigCache;
}

// Helper function to use chalk only when colors are enabled
export const color = {
  cyan: (text: string): string => isColorEnabled() ? chalk.cyan(text) : text,
  green: (text: string): string => isColorEnabled() ? chalk.green(text) : text,
  yellow: (text: string): string => isColorEnabled() ? chalk.yellow(text) : text,
  red: (text: string): string => isColorEnabled() ? chalk.red(text) : text,
  blue: (text: string): string => isColorEnabled() ? chalk.blue(text) : text,
  magenta: (text: string): string => isColorEnabled() ? chalk.magenta(text) : text,
  gray: (text: string): string => isColorEnabled() ? chalk.gray(text) : text,
  white: (text: string): string => isColorEnabled() ? chalk.white(text) : text,
  italic: (text: string): string => isColorEnabled() ? chalk.italic(text) : text,
  // Add a general bold function
  bold: (text: string): string => isColorEnabled() ? chalk.bold(text) : text,
  // Keep the specific color bold functions as an object
  boldColors: {
    cyan: (text: string): string => isColorEnabled() ? chalk.bold.cyan(text) : text,
    green: (text: string): string => isColorEnabled() ? chalk.bold.green(text) : text,
    yellow: (text: string): string => isColorEnabled() ? chalk.bold.yellow(text) : text,
    blue: (text: string): string => isColorEnabled() ? chalk.bold.blue(text) : text,
    magenta: (text: string): string => isColorEnabled() ? chalk.bold.magenta(text) : text,
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
 * Format and display a key-value pair with color
 */
export function formatKeyValue(key: string, value: any): void {
  // Check if colors are enabled from config
  const colorize = isColorEnabled();
  
  // Format the key with colors if enabled
  const formattedKey = colorize ? colorizePathByLevels(key) : key;
  
  // Format and print
  console.log(`${formattedKey}: ${value}`);
}

/**
 * Colorize path segments with alternating colors
 */
function colorizePathByLevels(path: string): string {
  // If colors are disabled, return plain path
  if (!isColorEnabled()) {
    return path;
  }
  
  const colors = [color.cyan, color.yellow, color.green, color.magenta, color.blue];
  const parts = path.split('.');
  
  return parts
    .map((part, index) => {
      const colorFn = colors[index % colors.length];
      return colorFn(part);
    })
    .join('.');
}

/**
 * Display a colorful help message
 * 
 * Generates and prints a formatted help screen with command usage,
 * available commands, examples, and data storage location.
 * Uses color coding to improve readability and visual appeal.
 */
export function showHelp(): void {
  // Remove direct chalk usage and use our color helper instead
  
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
  console.log('  get        [key]                      Retrieve entries or specific data');
  console.log('  find       <term>                     Find entries by key or value');
  console.log('  remove     <key>                      Remove an entry');
  console.log('  alias      <action> [name] [path]     Manage aliases for paths');
  console.log('  config     [setting] [value]          View or change configuration settings');
  console.log('  export     <type>                     Export data or aliases to a file');
  console.log('  import     <type> <file>              Import data or aliases from a file');
  console.log('  reset      <type>                     Reset data or aliases to empty state');
  console.log('  examples                              Initialize with example data');
  console.log('  help                                  Show this help message');
  
  console.log('\n' + color.boldColors.magenta('OPTIONS:'));
  console.log(`  ${color.yellow('--tree')}     Display data in a hierarchical tree structure`);
  console.log(`  ${color.yellow('--raw')}      Output raw values without formatting (for scripting)`);
  console.log(`  ${color.yellow('--debug')}    Enable debug output for troubleshooting\n`);
  
  console.log(color.boldColors.magenta('EXAMPLES:'));
  console.log(`  ${color.yellow('ccli')} ${color.green('add')} ${color.cyan('server.ip')} 192.168.1.100`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')}                          ${color.gray('# Show all entries')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('server.ip')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('server')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.yellow('--tree')}                  ${color.gray('# Display all data as a tree')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('find')} 192.168.1.100\n`);
  
  console.log(`  ${color.yellow('ccli')} ${color.green('alias')} ${color.cyan('set myalias server.production.ip')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('myalias')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('alias')} ${color.cyan('get')}                 ${color.gray('# List all aliases')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('alias')} ${color.cyan('get myalias')}         ${color.gray('# Show specific alias')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('alias')} ${color.cyan('remove myalias')}\n`);
  
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('server')} ${color.yellow('--tree')}    ${color.gray('# Display server info as a tree')}`);
  
  console.log(`  ${color.yellow('ccli')} ${color.green('examples')} ${color.yellow('--force')}     ${color.gray('# Initialize with example data')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('export')} ${color.cyan('data')} ${color.yellow('-o')} backup.json       ${color.gray('# Export data to a file')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('import')} ${color.cyan('all')} backup.json ${color.yellow('--merge')}   ${color.gray('# Import and merge data')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('reset')} ${color.cyan('aliases')} ${color.yellow('--force')}            ${color.gray('# Reset aliases to empty state')}`);
  
  console.log(`  ${color.yellow('ccli')} ${color.green('config')}                  ${color.gray('# View all current settings')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('config')} ${color.cyan('colors false')}     ${color.gray('# Disable colored output')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('config')} ${color.yellow('--list')}           ${color.gray('# List available settings')}\n`);
  
  const isDev = process.env.NODE_ENV === 'development';
  console.log(color.boldColors.magenta('DATA STORAGE:'));
  console.log(`  ${isDev ? '[DEV] ' : ''}Entries are stored in:       ${getDataFilePath()}`);
  console.log(`  ${isDev ? '[DEV] ' : ''}Aliases are stored in:       ${getAliasFilePath()}`);
  console.log(`  ${isDev ? '[DEV] ' : ''}Config is stored in:         ${getConfigFilePath()}\n`);
}

/**
 * Display data in a tree format
 */
export function displayTree(data: object, prefix: string = ''): void {
  // Use color only if enabled
  const colorEnabled = isColorEnabled();
  
  Object.entries(data).forEach(([key, value], index, array) => {
    const isLast = index === array.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const fullPrefix = prefix + connector;
    
    // Apply colors conditionally
    const displayKey = colorEnabled ? color.cyan(key) : key;
    
    if (typeof value === 'object' && value !== null) {
      console.log(`${fullPrefix}${displayKey}`);
      const childPrefix = prefix + (isLast ? ' '.repeat(4) : '│   ');
      displayTree(value, childPrefix);
    } else {
      const displayValue = colorEnabled ? color.white(value) : value;
      console.log(`${fullPrefix}${displayKey}: ${displayValue}`);
    }
  });
}

/**
 * Print system information
 */
export function printSystemInfo(isDev = false): void {
  console.log(`  ${isDev ? '[DEV] ' : ''}Data is stored in:          ${getDataFilePath()}`);
  console.log(`  ${isDev ? '[DEV] ' : ''}Aliases are stored in:       ${getAliasFilePath()}`);
  console.log(`  ${isDev ? '[DEV] ' : ''}Config is stored in:         ${getConfigFilePath()}\n`);
}