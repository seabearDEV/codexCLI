#!/usr/bin/env node

import { Command } from 'commander';
import * as commands from './commands';
import { removeAlias, resolveKey } from './alias';
import { showHelp, showExamples } from './formatting';
import { askPassword, askConfirmation, printError } from './commands/helpers';
import { version } from '../package.json';
import { getCompletions, generateBashScript, generateZshScript, installCompletions } from './completions';
import { withPager } from './utils/pager';

// Early-exit handler for shell tab-completion (must run before Commander parses args)
const completionFlagIndex = process.argv.indexOf('--get-completions');
if (completionFlagIndex !== -1) {
  const compLine = process.argv[completionFlagIndex + 1] || '';
  const compPoint = parseInt(process.argv[completionFlagIndex + 2] || '0', 10) || compLine.length;
  getCompletions(compLine, compPoint).forEach(r =>
    console.log(`${r.value}\t${r.description}\t${r.group}`)
  );
  process.exit(0);
}

// Initialize the CLI
const codexCLI = new Command();
codexCLI.name('ccli');
codexCLI.version(version);
codexCLI.description('A CLI tool for storing and retrieving code snippets, commands, and knowledge');

codexCLI.addHelpCommand(false);

// Add global debug option
codexCLI.option('--debug', 'Enable debug mode')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().debug) {
      process.env.DEBUG = 'true';
    }
  });

// Set command
codexCLI
  .command('set <key> [value...]')
  .alias('s')
  .description('Set an entry (prompts before overwriting)')
  .option('-f, --force', 'Overwrite existing entries without confirmation')
  .option('-e, --encrypt', 'Encrypt the value with a password')
  .option('-a, --alias <name>', 'Create an alias for this key')
  .option('-p, --prompt', 'Read value interactively (avoids shell expansion of $, !, etc.)')
  .option('-s, --show', 'Show input when using --prompt (default is masked)')
  .option('-c, --clear', 'Clear terminal and scrollback after setting (removes sensitive input from history)')
  .action(async (key: string, valueArray: string[], options: { force?: boolean, encrypt?: boolean, alias?: string, prompt?: boolean, show?: boolean, clear?: boolean }) => {
    let value: string | undefined;
    if (options.prompt) {
      if (!process.stdin.isTTY) {
        printError('--prompt requires an interactive terminal.');
        process.exitCode = 1;
        return;
      }
      if (options.show) {
        value = await askConfirmation('Value: ');
      } else {
        value = await askPassword('Value: ');
        const confirm = await askPassword('Confirm: ');
        if (value !== confirm) {
          printError('Values do not match.');
          process.exitCode = 1;
          return;
        }
      }
    } else if (valueArray.length === 0) {
      // Allow no value when -a is provided (alias-only update)
      if (!options.alias) {
        printError('Missing value. Provide a value or use --prompt (-p) to enter it interactively.');
        process.exitCode = 1;
        return;
      }
      value = undefined;
    } else {
      value = valueArray.join(' ');
    }
    await commands.setEntry(key.replace(/:$/, ''), value, options.force, options.encrypt, options.alias);
    if (options.clear) {
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    }
  });

// Get command
codexCLI
  .command('get [key]')
  .alias('g')
  .description('Retrieve entries or specific data')
  .option('-t, --tree', 'Display data in a hierarchical tree structure')
  .option('-r, --raw', 'Output plain text without colors (for scripting)')
  .option('-d, --decrypt', 'Decrypt an encrypted value (prompts for password)')
  .option('-c, --copy', 'Copy value to clipboard')
  .option('-a, --aliases', 'Show aliases only')
  .action(async (key: string | undefined, options: { tree?: boolean, raw?: boolean, decrypt?: boolean, copy?: boolean, aliases?: boolean }) => {
    if (key) {
      key = resolveKey(key.replace(/:$/, ''));
    }
    await withPager(() => commands.getEntry(key, options));
  });

// Run command
codexCLI
  .command('run <key>')
  .alias('r')
  .description('Execute a stored command')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--dry', 'Print the command without executing')
  .option('-d, --decrypt', 'Decrypt an encrypted command before running')
  .option('--source', 'Output command to stdout for shell eval (used by shell wrapper)')
  .action(async (key: string, options: { yes?: boolean, dry?: boolean, decrypt?: boolean, source?: boolean }) => {
    key = resolveKey(key.replace(/:$/, ''));
    await commands.runCommand(key, options);
  });

// Find command
codexCLI
  .command('find <term>')
  .alias('f')
  .description('Find entries by key or value')
  .option('-e, --entries', 'Search only in data entries')
  .option('-a, --aliases', 'Search only in aliases')
  .option('-t, --tree', 'Display results in a hierarchical tree structure')
  .action(async (term: string, options: { entries?: boolean, aliases?: boolean, tree?: boolean }) => {
    await withPager(() => commands.searchEntries(term, {
      entries: options.entries,
      aliases: options.aliases,
      tree: options.tree
    }));
  });

// Remove command
codexCLI
  .command('remove <key>')
  .alias('rm')
  .description('Remove an entry')
  .option('-a, --alias', 'Remove the alias only (keep the entry)')
  .action((key: string, options: { alias?: boolean }) => {
    if (options.alias) {
      const removed = removeAlias(key);
      if (removed) {
        console.log(`Alias '${key}' removed successfully.`);
      } else {
        console.error(`Alias '${key}' not found.`);
        process.exitCode = 1;
      }
    } else {
      commands.removeEntry(resolveKey(key.replace(/:$/, '')));
    }
  });

// Configuration commands
const configCommand = codexCLI
  .command('config')
  .description('Manage configuration settings')
  .action(async () => {
    await withPager(() => commands.handleConfig());
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key: string, value: string) => {
    commands.configSet(key, value);
  });

configCommand
  .command('get [key]')
  .description('Get configuration values')
  .action(async (key?: string) => {
    await withPager(() => commands.handleConfig(key));
  });

// Info command
codexCLI
  .command('info')
  .alias('i')
  .description('Show version, stats, and storage info')
  .action(() => {
    commands.showInfo();
  });

// Init command
codexCLI
  .command('init')
  .description('Initialize with example data')
  .option('-f, --force', 'Force overwrite if data already exists')
  .action((options: { force?: boolean }) => {
    commands.initializeExampleData(options.force);
  });

// Examples command
codexCLI
  .command('examples')
  .alias('ex')
  .description('Show usage examples')
  .action(() => { withPager(() => showExamples()); });

// Export command
codexCLI
  .command('export <type>')
  .description('Export data or aliases to a file')
  .option('--format <format>', 'Output format (json, yaml)')
  .option('-o, --output <file>', 'Output file path')
  .action(async (type: string, options: { format?: string, output?: string }) => {
    await withPager(() => commands.exportData(type, options));
  });

// Import command
codexCLI
  .command('import <type> <file>')
  .description('Import data or aliases from a file')
  .option('--format <format>', 'Format of input file')
  .action(async (type: string, file: string, options: { format?: string }) => {
    await commands.importData(type, file, options);
  });

// Reset command
codexCLI
  .command('reset <type>')
  .description('Reset data or aliases to empty state')
  .option('-f, --force', 'Skip confirmation')
  .action(async (type: string, options: { force?: boolean }) => {
    await commands.resetData(type, options);
  });

// Completions command group
const completionsCommand = codexCLI
  .command('completions')
  .description('Generate shell completion scripts');

completionsCommand
  .command('bash')
  .description('Output Bash completion script')
  .action(() => {
    process.stdout.write(generateBashScript());
  });

completionsCommand
  .command('zsh')
  .description('Output Zsh completion script')
  .action(() => {
    process.stdout.write(generateZshScript());
  });

completionsCommand
  .command('install')
  .description('Auto-detect shell and install completions')
  .action(() => {
    installCompletions();
  });

// Show rich help for: ccli, ccli --help, ccli -h, ccli help (with optional --debug)
const userArgs = process.argv.slice(2).filter(a => a !== '--debug');
const isRootHelp = userArgs.length === 0 ||
  (userArgs.length === 1 && ['--help', '-h', 'help'].includes(userArgs[0]));

if (isRootHelp) {
  if (process.argv.includes('--debug')) process.env.DEBUG = 'true';
  withPager(() => showHelp());
} else {
  codexCLI.parse(process.argv);
}
