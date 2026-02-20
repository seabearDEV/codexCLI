import chalk from 'chalk';
import { loadConfig } from './config';
import { isEncrypted } from './utils/crypto';
import { interpretEscapes, visibleLength, wordWrap } from './utils/wordWrap';

export function isColorEnabled(): boolean {
  return loadConfig().colors !== false;
}

/**
 * Highlight occurrences of a search term in text with bold inverse styling.
 * Case-insensitive. Preserves original casing of matched text.
 * Returns text unchanged when colors are disabled or term is empty.
 */
export function highlightMatch(text: string, term: string): string {
  if (!term || !isColorEnabled()) {
    return text;
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  return text.replace(regex, (match) => chalk.inverse(match));
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
export function formatKeyValue(key: string, value: unknown, searchTerm?: string): void {
  const formattedKey = isColorEnabled() ? colorizePathByLevels(key, searchTerm) : key;
  const displayValue = typeof value === 'string' && isEncrypted(value) ? '[encrypted]' : value;
  const prefix = `${formattedKey}:`;
  const termWidth = process.stdout.columns || 80;
  const prefixWidth = visibleLength(prefix) + 1; // +1 for the space
  const valueWidth = termWidth - prefixWidth;
  const rawValueStr = String(displayValue);
  const valueStr = searchTerm ? highlightMatch(rawValueStr, searchTerm) : rawValueStr;

  if (valueWidth < 20) {
    console.log(`${prefix} ${valueStr}`);
  } else {
    const wrapped = wordWrap(valueStr, valueWidth);
    const indent = ' '.repeat(prefixWidth);
    for (let i = 0; i < wrapped.length; i++) {
      if (i === 0) {
        console.log(`${prefix} ${wrapped[i]}`);
      } else {
        console.log(`${indent}${wrapped[i]}`);
      }
    }
  }
}

/**
 * Colorize path segments with alternating colors
 */
export function colorizePathByLevels(path: string, searchTerm?: string): string {
  if (!isColorEnabled()) {
    return path;
  }

  const colors = [color.cyan, color.yellow, color.green, color.magenta, color.blue];
  const parts = path.split('.');

  return parts
    .map((part, index) => {
      const colorFn = colors[index % colors.length];
      const highlighted = searchTerm ? highlightMatch(part, searchTerm) : part;
      return colorFn(highlighted);
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
  console.log('  set        <key> <value>              Set an entry (prompts before overwriting)');
  console.log('  get        [key]                      Retrieve entries or specific data');
  console.log('  run        <key>                      Execute a stored command');
  console.log('  find       <term>                     Find entries by key or value');
  console.log('  remove     <key>                      Remove an entry');
  console.log('  alias      <action> [name] [path]     Manage aliases for paths');
  console.log('  config     [setting] [value]          View or change configuration settings');
  console.log('  export     <type>                     Export data or aliases to a file');
  console.log('  import     <type> <file>              Import data or aliases from a file');
  console.log('  reset      <type>                     Reset data or aliases to empty state');
  console.log('  info                                  Show version, stats, and storage info');
  console.log('  init                                  Initialize with example data');
  console.log('  examples                              Show usage examples');
  console.log();
  console.log('  Use --help with any command for details (e.g. ccli set --help)');

  console.log('\n' + color.boldColors.magenta('SHORTCUTS:'));
  console.log(`  ${color.yellow('s')}            ${color.gray('=')} ${color.green('set')}                 ${color.gray('ccli s server.ip 192.168.1.1')}`);
  console.log(`  ${color.yellow('g')}            ${color.gray('=')} ${color.green('get')}                 ${color.gray('ccli g server.ip')}`);
  console.log(`  ${color.yellow('r')}            ${color.gray('=')} ${color.green('run')}                 ${color.gray('ccli r my.command')}`);
  console.log(`  ${color.yellow('f')}            ${color.gray('=')} ${color.green('find')}                ${color.gray('ccli f 192.168')}`);
  console.log(`  ${color.yellow('rm')}           ${color.gray('=')} ${color.green('remove')}              ${color.gray('ccli rm server.old')}`);
  console.log(`  ${color.yellow('i')}            ${color.gray('=')} ${color.green('info')}                ${color.gray('ccli i')}`);
  console.log(`  ${color.yellow('al')} ${color.gray('g')}         ${color.gray('=')} ${color.green('alias get')}           ${color.gray('ccli al g')}`);
  console.log(`  ${color.yellow('al')} ${color.gray('s')}         ${color.gray('=')} ${color.green('alias set')}           ${color.gray('ccli al s myip server.ip')}`);
  console.log(`  ${color.yellow('al')} ${color.gray('rm')}        ${color.gray('=')} ${color.green('alias remove')}        ${color.gray('ccli al rm myip')}`);
  console.log(`  ${color.yellow('al')} ${color.gray('rn')}        ${color.gray('=')} ${color.green('alias rename')}        ${color.gray('ccli al rn myip newip')}`);

  // Align all option descriptions at the same column
  const optDescCol = 26; // description starts this many chars after the 2-space indent
  const opt = (flag: string, desc: string) => {
    const pad = ' '.repeat(Math.max(2, optDescCol - visibleLength(flag)));
    console.log(`  ${flag}${pad}${desc}`);
  };

  console.log('\n' + color.boldColors.magenta('OPTIONS (set):'));
  opt(`${color.yellow('--force')}, ${color.yellow('-f')}`, 'Overwrite existing entries without confirmation');
  opt(`${color.yellow('--encrypt')}, ${color.yellow('-e')}`, 'Encrypt the value with a password');
  opt(`${color.yellow('--alias')} <name>`, 'Create an alias for this key');
  opt(`${color.yellow('--prompt')}, ${color.yellow('-p')}`, 'Read value interactively (avoids shell expansion)');
  opt(`${color.yellow('--show')}, ${color.yellow('-s')}`, 'Show input when using --prompt (default is masked)');

  console.log('\n' + color.boldColors.magenta('OPTIONS (get):'));
  opt(`${color.yellow('--tree')}, ${color.yellow('-t')}`, 'Display data in a hierarchical tree structure');
  opt(`${color.yellow('--raw')}, ${color.yellow('-r')}`, 'Output raw values without formatting (for scripting)');
  opt(`${color.yellow('--keys-only')}, ${color.yellow('-k')}`, 'Show only keys');
  opt(`${color.yellow('--decrypt')}, ${color.yellow('-d')}`, 'Decrypt an encrypted value');
  opt(`${color.yellow('--copy')}, ${color.yellow('-c')}`, 'Copy value to clipboard');

  console.log('\n' + color.boldColors.magenta('OPTIONS (run):'));
  opt(`${color.yellow('--yes')}, ${color.yellow('-y')}`, 'Skip confirmation prompt');
  opt(`${color.yellow('--dry')}`, 'Print the command without executing');
  opt(`${color.yellow('--decrypt')}, ${color.yellow('-d')}`, 'Decrypt an encrypted command before running');

  console.log('\n' + color.boldColors.magenta('OPTIONS (find):'));
  opt(`${color.yellow('--keys-only')}, ${color.yellow('-k')}`, 'Show only keys');
  opt(`${color.yellow('--values-only')}, ${color.yellow('-v')}`, 'Search only in values');
  opt(`${color.yellow('--entries-only')}, ${color.yellow('-e')}`, 'Search only in data entries');
  opt(`${color.yellow('--aliases-only')}, ${color.yellow('-a')}`, 'Search only in aliases');
  opt(`${color.yellow('--tree')}, ${color.yellow('-t')}`, 'Display results in a tree structure');

  console.log('\n' + color.boldColors.magenta('OPTIONS (global):'));
  opt(`${color.yellow('--debug')}`, 'Enable debug output for troubleshooting');
  console.log();
}

/**
 * Display comprehensive usage examples (standalone via `ccli examples`)
 */
export function showExamples(): void {
  const exDescCol = 50; // comment starts this many chars after the 2-space indent
  const ex = (cmd: string, comment: string) => {
    const pad = ' '.repeat(Math.max(2, exDescCol - visibleLength(cmd)));
    console.log(`  ${cmd}${pad}${color.gray(comment)}`);
  };

  const y = color.yellow;
  const g = color.green;
  const c = color.cyan;
  const section = (title: string) => console.log('\n' + color.boldColors.magenta(title));

  console.log();
  console.log('┌────────────────────────────┐');
  console.log('│ CodexCLI - Usage Examples  │');
  console.log('└────────────────────────────┘');

  section('STORING DATA:');
  ex(`${y('ccli')} ${g('set')} ${c('server.ip')} "192.168.1.100"`, '# Store a value');
  ex(`${y('ccli')} ${g('set')} ${c('deploy.cmd')} "docker compose up -d"`, '# Store a multi-word command');
  ex(`${y('ccli')} ${g('set')} ${c('api.key')} "sk-abc123" ${y('-e')}`, '# Encrypt a secret with a password');
  ex(`${y('ccli')} ${g('set')} ${c('db.host')} "mydb.local" ${y('-f')}`, '# Overwrite without confirmation');
  ex(`${y('ccli')} ${g('set')} ${c('db.host')} "mydb.local" ${y('-a')} ${c('dbh')}`, '# Store and create alias "dbh" at once');

  section('RETRIEVING DATA:');
  ex(`${y('ccli')} ${g('get')}`, '# List all entries');
  ex(`${y('ccli')} ${g('get')} ${c('server.ip')}`, '# Get a specific value');
  ex(`${y('ccli')} ${g('get')} ${c('server')}`, '# Get everything under a namespace');
  ex(`${y('ccli')} ${g('get')} ${y('-t')}`, '# Show all data as a tree');
  ex(`${y('ccli')} ${g('get')} ${c('server')} ${y('--tree')}`, '# Show a namespace as a tree');
  ex(`${y('ccli')} ${g('get')} ${c('server.ip')} ${y('--raw')}`, '# Raw value, no formatting (for scripts)');
  ex(`${y('ccli')} ${g('get')} ${y('--keys-only')}`, '# List just the keys');
  ex(`${y('ccli')} ${g('get')} ${c('api.key')} ${y('-d')}`, '# Decrypt an encrypted value');
  ex(`${y('ccli')} ${g('get')} ${c('server.ip')} ${y('-c')}`, '# Copy value to clipboard');

  section('RUNNING STORED COMMANDS:');
  ex(`${y('ccli')} ${g('run')} ${c('deploy.cmd')}`, '# Execute (prompts for confirmation)');
  ex(`${y('ccli')} ${g('run')} ${c('deploy.cmd')} ${y('-y')}`, '# Execute without confirmation');
  ex(`${y('ccli')} ${g('run')} ${c('deploy.cmd')} ${y('--dry')}`, '# Preview command without executing');
  ex(`${y('ccli')} ${g('run')} ${c('secret.script')} ${y('-d')}`, '# Decrypt and execute');

  section('SEARCHING:');
  ex(`${y('ccli')} ${g('find')} 192.168`, '# Search keys and values');
  ex(`${y('ccli')} ${g('find')} server ${y('-k')}`, '# Search only in keys');
  ex(`${y('ccli')} ${g('find')} production ${y('-v')}`, '# Search only in values');
  ex(`${y('ccli')} ${g('find')} prod ${y('-e')}`, '# Search data entries only (skip aliases)');
  ex(`${y('ccli')} ${g('find')} ip ${y('-a')}`, '# Search aliases only');
  ex(`${y('ccli')} ${g('find')} server ${y('-t')}`, '# Show results as a tree');

  section('ALIASES:');
  ex(`${y('ccli')} ${g('alias set')} ${c('prod')} ${c('server.production.ip')}`, '# Create alias "prod"');
  ex(`${y('ccli')} ${g('alias get')}`, '# List all aliases');
  ex(`${y('ccli')} ${g('alias get')} ${c('prod')}`, '# Show where "prod" points');
  ex(`${y('ccli')} ${g('alias get')} ${y('-t')}`, '# Display aliases as a tree');
  ex(`${y('ccli')} ${g('alias rename')} ${c('prod')} ${c('production')}`, '# Rename an alias');
  ex(`${y('ccli')} ${g('alias remove')} ${c('prod')}`, '# Remove an alias');
  ex(`${y('ccli')} ${g('get')} ${c('prod')}`, '# Use alias in place of full key path');

  section('REMOVING DATA:');
  ex(`${y('ccli')} ${g('remove')} ${c('server.old')}`, '# Remove an entry');

  section('IMPORT & EXPORT:');
  ex(`${y('ccli')} ${g('export')} data`, '# Export data to a timestamped file');
  ex(`${y('ccli')} ${g('export')} aliases ${y('-o')} aliases.json`, '# Export aliases to a specific file');
  ex(`${y('ccli')} ${g('export')} all ${y('-o')} backup.json`, '# Export everything');
  ex(`${y('ccli')} ${g('import')} data backup.json`, '# Import data from a file');
  ex(`${y('ccli')} ${g('import')} all backup.json`, '# Import data and aliases');
  ex(`${y('ccli')} ${g('reset')} data`, '# Clear all data (prompts first)');
  ex(`${y('ccli')} ${g('reset')} all ${y('-f')}`, '# Clear everything without confirmation');

  section('CONFIGURATION:');
  ex(`${y('ccli')} ${g('config')}`, '# Show all settings');
  ex(`${y('ccli')} ${g('config get')} ${c('theme')}`, '# Get a specific setting');
  ex(`${y('ccli')} ${g('config set')} ${c('theme')} dark`, '# Change theme (default/dark/light)');
  ex(`${y('ccli')} ${g('config set')} ${c('colors')} false`, '# Disable colored output');
  ex(`${y('ccli')} ${g('config set')} ${c('backend')} sqlite`, '# Switch storage to SQLite');

  section('MIGRATION:');
  ex(`${y('ccli')} ${g('migrate sqlite')}`, '# Migrate JSON data to SQLite');
  ex(`${y('ccli')} ${g('migrate json')}`, '# Migrate SQLite data back to JSON');
  ex(`${y('ccli')} ${g('migrate sqlite')} ${y('-f')}`, '# Force re-migration');

  section('SHELL COMPLETIONS:');
  ex(`${y('ccli')} ${g('completions install')}`, '# Auto-detect shell and install');
  ex(`${y('ccli')} ${g('completions bash')}`, '# Print Bash completion script');
  ex(`${y('ccli')} ${g('completions zsh')}`, '# Print Zsh completion script');

  section('OTHER:');
  ex(`${y('ccli')} ${g('info')}`, '# Show version, stats, and storage paths');
  ex(`${y('ccli')} ${g('init')}`, '# Load example data to explore');
  ex(`${y('ccli')} ${g('init')} ${y('-f')}`, '# Reload examples (overwrites existing)');

  section('INTERPOLATION:');
  ex(`${y('ccli')} ${g('set')} ${c('paths.github')} "/Users/me/Projects/github.com"`, '# Store a base path');
  ex(`${y('ccli')} ${g('set')} ${c('paths.myproject')} "cd \\$\{paths.github}/myproject"`, '# Reference it with ${key}');
  ex(`${y('ccli')} ${g('get')} ${c('paths.myproject')}`, '# Resolves: cd /Users/me/Projects/github.com/myproject');
  ex(`${y('ccli')} ${g('get')} ${c('paths.myproject')} ${y('--raw')}`, '# Shows template: cd ${paths.github}/myproject');
  ex(`${y('ccli')} ${g('run')} ${c('paths.myproject')} ${y('--dry -y')}`, '# Preview interpolated command');
  ex(`${y('ccli')} ${g('set')} ${c('paths.myproject')} ${y('-p')}`, '# Use --prompt to avoid escaping ${}');

  section('SCRIPTING TIPS:');
  ex(`ssh $(${y('ccli')} ${g('get')} ${c('server.ip')} ${y('-r')})`, '# Use raw output in other commands');
  ex(`${y('ccli')} ${g('get')} ${c('api.key')} ${y('-d -c')}`, '# Decrypt and copy to clipboard');
  ex(`${y('ccli')} ${g('run')} ${c('deploy.cmd')} ${y('-d -y')}`, '# Decrypt and run without prompt');

  console.log();
}

export function showAliasHelp(): void {
  console.log();
  console.log('┌─────────────────────────────┐');
  console.log('│ CodexCLI - Alias Management │');
  console.log('└─────────────────────────────┘');
  console.log();
  console.log('USAGE:');
  console.log('  ccli alias <command> [options]');
  console.log();
  console.log('COMMANDS:');
  console.log('  set        <name> <path>          Create or update an alias');
  console.log('  get        [name]                 List all aliases or get a specific one');
  console.log('  remove     <name>                 Remove an alias');
  console.log('  rename     <old> <new>            Rename an alias');

  console.log('\n' + color.boldColors.magenta('SHORTCUTS:'));
  console.log(`  ${color.yellow('al s')}         ${color.gray('=')} ${color.green('alias set')}           ${color.gray('ccli al s myip server.ip')}`);
  console.log(`  ${color.yellow('al g')}         ${color.gray('=')} ${color.green('alias get')}           ${color.gray('ccli al g')}`);
  console.log(`  ${color.yellow('al rm')}        ${color.gray('=')} ${color.green('alias remove')}        ${color.gray('ccli al rm myip')}`);
  console.log(`  ${color.yellow('al rn')}        ${color.gray('=')} ${color.green('alias rename')}        ${color.gray('ccli al rn myip newip')}`);

  const alOpt = (flag: string, desc: string) => {
    const pad = ' '.repeat(Math.max(2, 26 - visibleLength(flag)));
    console.log(`  ${flag}${pad}${desc}`);
  };
  console.log('\n' + color.boldColors.magenta('OPTIONS:'));
  alOpt(`${color.yellow('--tree')}, ${color.yellow('-t')}`, 'Display aliases in a hierarchical tree structure');
  alOpt(`${color.yellow('--keys-only')}, ${color.yellow('-k')}`, 'Only show alias names');

  const alEx = (cmd: string, comment: string) => {
    const pad = ' '.repeat(Math.max(2, 38 - visibleLength(cmd)));
    console.log(`  ${cmd}${pad}${color.gray(comment)}`);
  };
  console.log('\n' + color.boldColors.magenta('EXAMPLES:'));
  alEx(`${color.yellow('ccli')} ${color.green('alias set')} ${color.cyan('myip')} server.ip`, '# Create alias "myip" for "server.ip"');
  alEx(`${color.yellow('ccli')} ${color.green('alias get')}`, '# List all aliases');
  alEx(`${color.yellow('ccli')} ${color.green('alias get')} ${color.cyan('myip')}`, '# Show where "myip" points');
  alEx(`${color.yellow('ccli')} ${color.green('alias get')} ${color.yellow('-t')}`, '# Display aliases as a tree');
  alEx(`${color.yellow('ccli')} ${color.green('alias rename')} ${color.cyan('myip')} ${color.cyan('prodip')}`, '# Rename "myip" to "prodip"');
  alEx(`${color.yellow('ccli')} ${color.green('alias remove')} ${color.cyan('myip')}`, '# Remove the "myip" alias');
  alEx(`${color.yellow('ccli')} ${color.green('get')} ${color.cyan('myip')}`, '# Use alias in place of key');
  console.log();
}

export function showConfigHelp(): void {
  console.log();
  console.log('┌──────────────────────────────────────┐');
  console.log('│ CodexCLI - Configuration Management  │');
  console.log('└──────────────────────────────────────┘');
  console.log();
  console.log('USAGE:');
  console.log('  ccli config [command] [options]');
  console.log();
  console.log('COMMANDS:');
  console.log('  set        <key> <value>          Set a configuration value');
  console.log('  get        [key]                  Get configuration values');
  console.log();
  console.log('  Running `ccli config` with no arguments shows all current settings.');

  console.log('\n' + color.boldColors.magenta('SETTINGS:'));

  const cfgOpt = (key: string, desc: string) => {
    const pad = ' '.repeat(Math.max(2, 14 - visibleLength(key)));
    console.log(`  ${color.green(key)}${pad}${desc}`);
  };
  cfgOpt('colors', 'Enable/disable colored output (true/false)');
  cfgOpt('theme', `UI theme (${['default', 'dark', 'light'].join('/')})`);
  cfgOpt('backend', 'Storage backend (json/sqlite)');

  const cfgEx = (cmd: string, comment: string) => {
    const pad = ' '.repeat(Math.max(2, 38 - visibleLength(cmd)));
    console.log(`  ${cmd}${pad}${color.gray(comment)}`);
  };
  console.log('\n' + color.boldColors.magenta('EXAMPLES:'));
  cfgEx(`${color.yellow('ccli')} ${color.green('config')}`, '# Show all current settings');
  cfgEx(`${color.yellow('ccli')} ${color.green('config get')} ${color.cyan('theme')}`, '# Get a specific setting');
  cfgEx(`${color.yellow('ccli')} ${color.green('config set')} ${color.cyan('theme')} dark`, '# Set theme to dark');
  cfgEx(`${color.yellow('ccli')} ${color.green('config set')} ${color.cyan('colors')} false`, '# Disable colored output');
  cfgEx(`${color.yellow('ccli')} ${color.green('config set')} ${color.cyan('backend')} sqlite`, '# Switch to SQLite backend');
  console.log();
}

/**
 * Build a tree-formatted string from nested data.
 * When colorize is omitted it defaults to the user's color setting.
 */
export function formatTree(
  data: Record<string, unknown>,
  keyToAliasMap: Record<string, string[]> = {},
  prefix = '',
  path = '',
  colorize?: boolean,
  raw = false
): string {
  const colorEnabled = colorize ?? isColorEnabled();
  const lines: string[] = [];

  Object.entries(data).forEach(([key, value], index, array) => {
    const isLast = index === array.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const fullPrefix = prefix + connector;

    const displayKey = colorEnabled ? color.cyan(key) : key;

    const fullPath = path ? `${path}.${key}` : key;

    const aliases = keyToAliasMap[fullPath];
    const aliasDisplay = aliases && aliases.length > 0 ? ` (${aliases[0]})` : '';

    if (typeof value === 'object' && value !== null) {
      lines.push(`${fullPrefix}${displayKey}${aliasDisplay}`);
      const childPrefix = prefix + (isLast ? ' '.repeat(4) : '│   ');
      lines.push(formatTree(value as Record<string, unknown>, keyToAliasMap, childPrefix, fullPath, colorEnabled, raw));
    } else {
      const rawValue = String(value);
      const masked = isEncrypted(rawValue) ? '[encrypted]' : (raw ? rawValue : interpretEscapes(rawValue));
      const valueLines = masked.split('\n');
      const continuationPrefix = prefix + (isLast ? '    ' : '│   ') + '  ';

      if (valueLines.length > 1) {
        lines.push(`${fullPrefix}${displayKey}${aliasDisplay}:`);
        for (const vl of valueLines) {
          const displayLine = colorEnabled ? color.white(vl) : vl;
          lines.push(`${continuationPrefix}${displayLine}`);
        }
      } else {
        const displayValue = colorEnabled ? color.white(valueLines[0]) : valueLines[0];
        lines.push(`${fullPrefix}${displayKey}${aliasDisplay}: ${displayValue}`);
      }
    }
  });

  return lines.filter(l => l.length > 0).join('\n');
}

/**
 * Display data in a tree format (prints to stdout)
 */
export function displayTree(data: Record<string, unknown>, keyToAliasMap: Record<string, string[]> = {}, prefix = '', path = '', raw = false): void {
  console.log(formatTree(data, keyToAliasMap, prefix, path, undefined, raw));
}

