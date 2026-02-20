import chalk from 'chalk';
import { loadConfig } from './config';
import { isEncrypted } from './utils/crypto';
import { interpolate } from './utils/interpolate';
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
  console.log('USAGE:');
  console.log('  ccli <command> [parameters] [options]');
  console.log();
  console.log('COMMANDS:');
  const cmd = (name: string, shortcut: string, args: string, desc: string) => {
    const nameCol = name.padEnd(12);
    const shortcutCol = shortcut.padEnd(4);
    const argsCol = args.padEnd(20);
    console.log(`  ${color.green(nameCol)} ${color.yellow(shortcutCol)} ${argsCol} ${desc}`);
  };
  cmd('set',      's',  '<key> [value]',      'Set an entry (value optional with -a)');
  cmd('get',      'g',  '[key]',              'Retrieve entries or specific data');
  cmd('run',      'r',  '<keys...>',          'Execute stored command(s) (: compose, && chain)');
  cmd('find',     'f',  '<term>',             'Find entries by key or value');
  cmd('rename',   'rn', '<old> <new>',         'Rename an entry key or alias');
  cmd('remove',   'rm', '<key>',              'Remove an entry and its alias');
  cmd('config',   '',   '[setting] [value]',  'View or change configuration settings');
  cmd('data',     '',   '<subcommand>',       'Manage stored data (export, import, reset)');
  console.log();
  console.log('SUBCOMMANDS:');
  console.log(`  ${color.green('config')}       info, examples, completions <bash|zsh|install>`);
  console.log(`  ${color.green('data')}         export <type>, import <type> <file>, reset <type>`);
  console.log();
  console.log('  Use --help with any command for details (e.g. ccli set --help)');

  // Align all option descriptions at the same column
  const optDescCol = 26; // description starts this many chars after the 2-space indent
  const opt = (flag: string, desc: string) => {
    const pad = ' '.repeat(Math.max(2, optDescCol - visibleLength(flag)));
    console.log(`  ${flag}${pad}${desc}`);
  };

  console.log('\n' + color.boldColors.magenta('OPTIONS (set):'));
  opt(`${color.yellow('--force')}, ${color.yellow('-f')}`, 'Overwrite existing entries without confirmation');
  opt(`${color.yellow('--encrypt')}, ${color.yellow('-e')}`, 'Encrypt the value with a password');
  opt(`${color.yellow('--alias')} <name>, ${color.yellow('-a')}`, 'Create or change an alias (value optional)');
  opt(`${color.yellow('--prompt')}, ${color.yellow('-p')}`, 'Read value interactively (avoids shell expansion)');
  opt(`${color.yellow('--show')}, ${color.yellow('-s')}`, 'Show input when using --prompt (default is masked)');
  opt(`${color.yellow('--clear')}, ${color.yellow('-c')}`, 'Clear terminal and scrollback after setting');
  opt(`${color.yellow('--confirm')}`, 'Require confirmation before running this entry');
  opt(`${color.yellow('--no-confirm')}`, 'Remove confirmation requirement from this entry');

  console.log('\n' + color.boldColors.magenta('OPTIONS (get):'));
  opt(`${color.yellow('--tree')}, ${color.yellow('-t')}`, 'Display data in a hierarchical tree structure');
  opt(`${color.yellow('--raw')}, ${color.yellow('-r')}`, 'Output plain text without colors (for scripting)');
  opt(`${color.yellow('--source')}, ${color.yellow('-s')}`, 'Show stored value before interpolation');
  opt(`${color.yellow('--decrypt')}, ${color.yellow('-d')}`, 'Decrypt an encrypted value');
  opt(`${color.yellow('--copy')}, ${color.yellow('-c')}`, 'Copy value to clipboard');
  opt(`${color.yellow('--aliases')}, ${color.yellow('-a')}`, 'Show aliases only');

  console.log('\n' + color.boldColors.magenta('OPTIONS (run):'));
  opt(`${color.yellow('--yes')}, ${color.yellow('-y')}`, 'Skip confirmation prompt (for entries marked --confirm)');
  opt(`${color.yellow('--dry')}`, 'Print the command without executing');
  opt(`${color.yellow('--decrypt')}, ${color.yellow('-d')}`, 'Decrypt an encrypted command before running');

  console.log('\n' + color.boldColors.magenta('OPTIONS (find):'));
  opt(`${color.yellow('--entries')}, ${color.yellow('-e')}`, 'Search only in data entries');
  opt(`${color.yellow('--aliases')}, ${color.yellow('-a')}`, 'Search only in aliases');
  opt(`${color.yellow('--tree')}, ${color.yellow('-t')}`, 'Display results in a tree structure');

  console.log('\n' + color.boldColors.magenta('OPTIONS (rename):'));
  opt(`${color.yellow('--alias')}, ${color.yellow('-a')}`, 'Rename an alias instead of an entry key');
  opt(`${color.yellow('--set-alias')} <name>`, 'Set an alias on the renamed key');

  console.log('\n' + color.boldColors.magenta('OPTIONS (remove):'));
  opt(`${color.yellow('--force')}, ${color.yellow('-f')}`, 'Skip confirmation prompt');
  opt(`${color.yellow('--alias')}, ${color.yellow('-a')}`, 'Remove the alias only (keep the entry)');

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

  section('STORING DATA:');
  ex(`${y('ccli')} ${g('set')} ${c('server.ip')} "192.168.1.100"`, '# Store a value');
  ex(`${y('ccli')} ${g('set')} ${c('deploy.cmd')} "docker compose up -d"`, '# Store a multi-word command');
  ex(`${y('ccli')} ${g('set')} ${c('api.key')} "sk-abc123" ${y('-e')}`, '# Encrypt a secret with a password');
  ex(`${y('ccli')} ${g('set')} ${c('db.host')} "mydb.local" ${y('-f')}`, '# Overwrite without confirmation');
  ex(`${y('ccli')} ${g('set')} ${c('db.host')} "mydb.local" ${y('-a')} ${c('dbh')}`, '# Store and create alias "dbh" at once');
  ex(`${y('ccli')} ${g('set')} ${c('db.host')} ${y('-a')} ${c('newdbh')}`, '# Change alias without re-setting value');

  section('RETRIEVING DATA:');
  ex(`${y('ccli')} ${g('get')}`, '# List all entries and aliases');
  ex(`${y('ccli')} ${g('get')} ${y('-e')}`, '# List entries only (no aliases)');
  ex(`${y('ccli')} ${g('get')} ${y('-a')}`, '# List aliases only');
  ex(`${y('ccli')} ${g('get')} ${c('server.ip')}`, '# Get a specific value');
  ex(`${y('ccli')} ${g('get')} ${c('server')}`, '# Get everything under a namespace');
  ex(`${y('ccli')} ${g('get')} ${y('-t')}`, '# Show all data as a tree');
  ex(`${y('ccli')} ${g('get')} ${c('server')} ${y('--tree')}`, '# Show a namespace as a tree');
  ex(`${y('ccli')} ${g('get')} ${c('server.ip')} ${y('--raw')}`, '# Raw value, no formatting (for scripts)');
  ex(`${y('ccli')} ${g('get')} ${c('api.key')} ${y('-d')}`, '# Decrypt an encrypted value');
  ex(`${y('ccli')} ${g('get')} ${c('server.ip')} ${y('-c')}`, '# Copy value to clipboard');

  section('RUNNING STORED COMMANDS:');
  ex(`${y('ccli')} ${g('run')} ${c('deploy.cmd')}`, '# Execute (prompts for confirmation)');
  ex(`${y('ccli')} ${g('run')} ${c('deploy.cmd')} ${y('-y')}`, '# Execute without confirmation');
  ex(`${y('ccli')} ${g('run')} ${c('deploy.cmd')} ${y('--dry')}`, '# Preview command without executing');
  ex(`${y('ccli')} ${g('run')} ${c('nav.project')} ${c('commands.list')}`, '# Chain: cd /path && ls -l');
  ex(`${y('ccli')} ${g('run')} ${c('secret.script')} ${y('-d')}`, '# Decrypt and execute');

  section('SEARCHING:');
  ex(`${y('ccli')} ${g('find')} 192.168`, '# Search keys and values');
  ex(`${y('ccli')} ${g('find')} server ${y('-k')}`, '# Search only in keys');
  ex(`${y('ccli')} ${g('find')} production ${y('-v')}`, '# Search only in values');
  ex(`${y('ccli')} ${g('find')} prod ${y('-e')}`, '# Search data entries only (skip aliases)');
  ex(`${y('ccli')} ${g('find')} ip ${y('-a')}`, '# Search aliases only');
  ex(`${y('ccli')} ${g('find')} server ${y('-t')}`, '# Show results as a tree');

  section('ALIASES:');
  ex(`${y('ccli')} ${g('set')} ${c('server.ip')} "192.168.1.100" ${y('-a')} ${c('ip')}`, '# Create entry with alias');
  ex(`${y('ccli')} ${g('set')} ${c('server.ip')} ${y('-a')} ${c('sip')}`, '# Change alias (keep value)');
  ex(`${y('ccli')} ${g('get')} ${y('-a')}`, '# List all aliases');
  ex(`${y('ccli')} ${g('get')} ${c('ip')}`, '# Use alias in place of full key path');
  ex(`${y('ccli')} ${g('remove')} ${c('ip')} ${y('-a')}`, '# Remove alias only (keep entry)');
  ex(`${y('ccli')} ${g('remove')} ${c('server.ip')}`, '# Remove entry and its alias');

  section('REMOVING DATA:');
  ex(`${y('ccli')} ${g('remove')} ${c('server.old')}`, '# Remove an entry (and its alias)');
  ex(`${y('ccli')} ${g('remove')} ${c('myalias')} ${y('-a')}`, '# Remove alias only (keep the entry)');

  section('IMPORT & EXPORT:');
  ex(`${y('ccli')} ${g('data export')} entries`, '# Export data to a timestamped file');
  ex(`${y('ccli')} ${g('data export')} aliases ${y('-o')} aliases.json`, '# Export aliases to a specific file');
  ex(`${y('ccli')} ${g('data export')} all ${y('-o')} backup.json`, '# Export everything');
  ex(`${y('ccli')} ${g('data import')} entries backup.json`, '# Import data from a file');
  ex(`${y('ccli')} ${g('data import')} all backup.json`, '# Import data and aliases');
  ex(`${y('ccli')} ${g('data reset')} entries`, '# Clear all data (prompts first)');
  ex(`${y('ccli')} ${g('data reset')} all ${y('-f')}`, '# Clear everything without confirmation');

  section('CONFIGURATION:');
  ex(`${y('ccli')} ${g('config')}`, '# Show all settings');
  ex(`${y('ccli')} ${g('config get')} ${c('theme')}`, '# Get a specific setting');
  ex(`${y('ccli')} ${g('config set')} ${c('theme')} dark`, '# Change theme (default/dark/light)');
  ex(`${y('ccli')} ${g('config set')} ${c('colors')} false`, '# Disable colored output');

  section('SHELL COMPLETIONS:');
  ex(`${y('ccli')} ${g('config completions install')}`, '# Auto-detect shell and install');
  ex(`${y('ccli')} ${g('config completions bash')}`, '# Print Bash completion script');
  ex(`${y('ccli')} ${g('config completions zsh')}`, '# Print Zsh completion script');

  section('OTHER:');
  ex(`${y('ccli')} ${g('config info')}`, '# Show version, stats, and storage paths');

  section('INTERPOLATION:');
  ex(`${y('ccli')} ${g('set')} ${c('paths.github')} "/Users/me/Projects/github.com"`, '# Store a base path');
  ex(`${y('ccli')} ${g('set')} ${c('paths.myproject')} "cd \\$\{paths.github}/myproject"`, '# Reference it with ${key}');
  ex(`${y('ccli')} ${g('get')} ${c('paths.myproject')}`, '# Resolves: cd /Users/me/Projects/github.com/myproject');
  ex(`${y('ccli')} ${g('get')} ${c('paths.myproject')} ${y('--raw')}`, '# Plain text, no colors (for scripting)');
  ex(`${y('ccli')} ${g('run')} ${c('paths.myproject')} ${y('--dry -y')}`, '# Preview interpolated command');
  ex(`${y('ccli')} ${g('set')} ${c('paths.myproject')} ${y('-p')}`, '# Use --prompt to avoid escaping ${}');

  section('SCRIPTING TIPS:');
  ex(`ssh $(${y('ccli')} ${g('get')} ${c('server.ip')} ${y('-r')})`, '# Use raw output in other commands');
  ex(`${y('ccli')} ${g('get')} ${c('api.key')} ${y('-d -c')}`, '# Decrypt and copy to clipboard');
  ex(`${y('ccli')} ${g('run')} ${c('deploy.cmd')} ${y('-d -y')}`, '# Decrypt and run without prompt');

  console.log();
}

/**
 * Build a tree-formatted string from nested data.
 * When colorize is omitted it defaults to the user's color setting.
 */
export function formatTree(
  data: Record<string, unknown>,
  keyToAliasMap: Record<string, string> = {},
  prefix = '',
  path = '',
  colorize?: boolean,
  raw = false,
  searchTerm?: string
): string {
  const colorEnabled = colorize ?? isColorEnabled();
  const lines: string[] = [];

  Object.entries(data).forEach(([key, value], index, array) => {
    const isLast = index === array.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const fullPrefix = prefix + connector;

    let displayKey = colorEnabled ? color.cyan(key) : key;
    if (searchTerm) displayKey = highlightMatch(displayKey, searchTerm);

    const fullPath = path ? `${path}.${key}` : key;

    const alias = keyToAliasMap[fullPath];
    const aliasDisplay = alias ? ` (${alias})` : '';

    if (typeof value === 'object' && value !== null) {
      lines.push(`${fullPrefix}${displayKey}${aliasDisplay}`);
      const childPrefix = prefix + (isLast ? ' '.repeat(4) : '│   ');
      lines.push(formatTree(value as Record<string, unknown>, keyToAliasMap, childPrefix, fullPath, colorEnabled, raw, searchTerm));
    } else {
      const rawValue = String(value);
      let resolved = rawValue;
      if (!isEncrypted(rawValue)) {
        try { resolved = interpolate(rawValue); } catch { /* use raw */ }
      }
      const masked = isEncrypted(rawValue) ? '[encrypted]' : (raw ? resolved : interpretEscapes(resolved));
      const valueLines = masked.split('\n');
      const continuationPrefix = prefix + (isLast ? '    ' : '│   ') + '  ';

      if (valueLines.length > 1) {
        lines.push(`${fullPrefix}${displayKey}${aliasDisplay}:`);
        for (const vl of valueLines) {
          let displayLine = colorEnabled ? color.white(vl) : vl;
          if (searchTerm) displayLine = highlightMatch(displayLine, searchTerm);
          lines.push(`${continuationPrefix}${displayLine}`);
        }
      } else {
        let displayValue = colorEnabled ? color.white(valueLines[0]) : valueLines[0];
        if (searchTerm) displayValue = highlightMatch(displayValue, searchTerm);
        lines.push(`${fullPrefix}${displayKey}${aliasDisplay}: ${displayValue}`);
      }
    }
  });

  return lines.filter(l => l.length > 0).join('\n');
}

/**
 * Display data in a tree format (prints to stdout)
 */
export function displayTree(data: Record<string, unknown>, keyToAliasMap: Record<string, string> = {}, prefix = '', path = '', raw = false, searchTerm?: string): void {
  console.log(formatTree(data, keyToAliasMap, prefix, path, undefined, raw, searchTerm));
}

