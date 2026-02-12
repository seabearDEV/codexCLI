import chalk from 'chalk';
import { getDataFilePath, getAliasFilePath, getConfigFilePath } from './utils/paths';
import { loadConfig } from './config';

// Cache color config to avoid frequent reloading
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

// Color helper functions that respect user configuration
export const color = {
  cyan: (text: string): string => isColorEnabled() ? chalk.cyan(text) : text,
  green: (text: string): string => isColorEnabled() ? chalk.green(text) : text,
  yellow: (text: string): string => isColorEnabled() ? chalk.yellow(text) : text,
  red: (text: string): string => isColorEnabled() ? chalk.red(text) : text,
  blue: (text: string): string => isColorEnabled() ? chalk.blueBright(text) : text,
  magenta: (text: string): string => isColorEnabled() ? chalk.magenta(text) : text,
  gray: (text: string): string => isColorEnabled() ? chalk.gray(text) : text,
  white: (text: string): string => isColorEnabled() ? chalk.whiteBright(text) : text,
  italic: (text: string): string => isColorEnabled() ? chalk.italic(text) : text,
  bold: (text: string): string => isColorEnabled() ? chalk.bold(text) : text,
  boldColors: {
    cyan: (text: string): string => isColorEnabled() ? chalk.bold.cyan(text) : text,
    green: (text: string): string => isColorEnabled() ? chalk.bold.green(text) : text,
    yellow: (text: string): string => isColorEnabled() ? chalk.bold.yellow(text) : text,
    blue: (text: string): string => isColorEnabled() ? chalk.bold.blueBright(text) : text,
    magenta: (text: string): string => isColorEnabled() ? chalk.bold.magenta(text) : text,
  }
};

/**
 * Format and display a key-value pair with color
 */
export function formatKeyValue(key: string, value: any): void {
  const formattedKey = isColorEnabled() ? colorizePathByLevels(key) : key;
  console.log(`${formattedKey}: ${value}`);
}

/**
 * Colorize path segments with alternating colors
 */
export function colorizePathByLevels(path: string): string {
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

  console.log('\n' + color.boldColors.magenta('SHORTCUTS:'));
  console.log(`  ${color.yellow('g')}            ${color.gray('=')} ${color.green('get')}                 ${color.gray('ccli g server.ip')}`);
  console.log(`  ${color.yellow('a')}            ${color.gray('=')} ${color.green('add')}                 ${color.gray('ccli a server.ip 192.168.1.1')}`);
  console.log(`  ${color.yellow('f')}            ${color.gray('=')} ${color.green('find')}                ${color.gray('ccli f 192.168')}`);
  console.log(`  ${color.yellow('rm')}           ${color.gray('=')} ${color.green('remove')}              ${color.gray('ccli rm server.old')}`);
  console.log(`  ${color.yellow('al')} ${color.gray('g')}         ${color.gray('=')} ${color.green('alias get')}           ${color.gray('ccli al g')}`);
  console.log(`  ${color.yellow('al')} ${color.gray('a')}         ${color.gray('=')} ${color.green('alias add')}           ${color.gray('ccli al a myip server.ip')}`);
  console.log(`  ${color.yellow('al')} ${color.gray('rm')}        ${color.gray('=')} ${color.green('alias remove')}        ${color.gray('ccli al rm myip')}`);

  console.log('\n' + color.boldColors.magenta('OPTIONS:'));
  console.log(`  ${color.yellow('--tree')}          Display data in a hierarchical tree structure`);
  console.log(`  ${color.yellow('--raw')}           Output raw values without formatting (for scripting)`);
  console.log(`  ${color.yellow('--debug')}         Enable debug output for troubleshooting`);
  console.log(`  ${color.yellow('--keys-only')}, ${color.yellow('-k')}   Search only in keys (for find command)`);
  console.log(`  ${color.yellow('--values-only')}, ${color.yellow('-v')}  Search only in values (for find command)`);
  console.log(`  ${color.yellow('--entries-only')}, ${color.yellow('-e')}  Search only in data entries (for find command)`);
  console.log(`  ${color.yellow('--aliases-only')}, ${color.yellow('-a')}  Search only in aliases (for find command)}\n`);

  console.log(color.boldColors.magenta('EXAMPLES:'));
  console.log(`  ${color.yellow('ccli')} ${color.green('add')} ${color.cyan('server.ip')} 192.168.1.100`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')}                          ${color.gray('# Show all entries')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('server.ip')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.cyan('server')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('get')} ${color.yellow('--tree')}                  ${color.gray('# Display all data as a tree')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('find')} 192.168.1.100`);
  console.log(`  ${color.yellow('ccli')} ${color.green('find')} 192.168.1.100 ${color.yellow('--aliases-only')}  ${color.gray('# Search only in aliases')}`);
  console.log(`  ${color.yellow('ccli')} ${color.green('find')} prod ${color.yellow('-a')}               ${color.gray('# Search only in aliases (short form)')}\n`);

  const isDev = process.env.NODE_ENV === 'development';
  console.log(color.boldColors.magenta('DATA STORAGE:'));
  console.log(`  ${isDev ? '[DEV] ' : ''}Entries are stored in:       ${getDataFilePath()}`);
  console.log(`  ${isDev ? '[DEV] ' : ''}Aliases are stored in:       ${getAliasFilePath()}`);
  console.log(`  ${isDev ? '[DEV] ' : ''}Config is stored in:         ${getConfigFilePath()}\n`);
}

/**
 * Display data in a tree format
 */
export function displayTree(data: object, keyToAliasMap: Record<string, string[]> = {}, prefix = '', path = ''): void {
  const colorEnabled = isColorEnabled();

  Object.entries(data).forEach(([key, value], index, array) => {
    const isLast = index === array.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const fullPrefix = prefix + connector;

    const displayKey = colorEnabled ? color.cyan(key) : key;
    
    // Calculate the full path for this entry (needed for alias lookup)
    const fullPath = path ? `${path}.${key}` : key;
    
    // Look up any aliases for this path
    const aliases = keyToAliasMap[fullPath];
    const aliasDisplay = aliases && aliases.length > 0 ? ` (${aliases[0]})` : '';

    if (typeof value === 'object' && value !== null) {
      console.log(`${fullPrefix}${displayKey}${aliasDisplay}`);
      const childPrefix = prefix + (isLast ? ' '.repeat(4) : '│   ');
      displayTree(value, keyToAliasMap, childPrefix, fullPath);
    } else {
      const displayValue = colorEnabled ? color.white(value) : value;
      console.log(`${fullPrefix}${displayKey}${aliasDisplay}: ${displayValue}`);
    }
  });
}

