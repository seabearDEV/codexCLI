#!/usr/bin/env node

import { Command } from 'commander';
import * as commands from './commands'; 
import { setAlias, removeAlias, loadAliases } from './alias';
import { showHelp } from './formatting';
import { version } from '../package.json';

// Initialize the CLI
const codexCLI = new Command();
codexCLI.version(version);
codexCLI.description('A CLI tool for storing and retrieving code snippets, commands, and knowledge');

// Add command
codexCLI
  .command('add <key> <value...>')
  .description('Add or update an entry')
  .action((key: string, valueArray: string[]) => {
    commands.addEntry(key, valueArray.join(' '));
  });

// Get command
codexCLI
  .command('get [key]')
  .description('Retrieve entries or specific data')
  .option('-f, --format <format>', 'Output format (json, yaml, text)')
  .action((key: string | undefined, options: { format?: string }) => {
    commands.getEntry(key, options);
  });

// Find command
codexCLI
  .command('find <term>')
  .description('Find entries by key or value')
  .option('-k, --keys-only', 'Only search in keys')
  .option('-v, --values-only', 'Only search in values')
  .action((term: string, options: { keysOnly?: boolean, valuesOnly?: boolean }) => {
    commands.searchEntries(term, {
      keysOnly: options.keysOnly,
      valuesOnly: options.valuesOnly,
    });
  });

// Remove command
codexCLI
  .command('remove <key>')
  .description('Remove an entry')
  .action((key: string) => {
    commands.removeEntry(key);
  });

// Alias management commands
const aliasCommand = codexCLI
  .command('alias')
  .description('Manage command aliases');

aliasCommand
  .command('add <name> <command...>')
  .description('Add a new command alias')
  .action((name: string, commandArray: string[]) => {
    // Use directly imported function instead of through commands
    setAlias(name, commandArray.join(' '));
  });

aliasCommand
  .command('remove <name>')
  .description('Remove an alias')
  .action((name: string) => {
    // Use directly imported function
    removeAlias(name);
  });

aliasCommand
  .command('list')
  .description('List all aliases')
  .action(() => {
    // Use directly imported function
    const aliases = loadAliases();
    console.log('Aliases:');
    Object.entries(aliases).forEach(([alias, path]) => {
      console.log(`  ${alias} -> ${path}`);
    });
  });

aliasCommand
  .command('run <name> [args...]')
  .description('Run an alias with optional arguments')
  .action((name: string, args: string[]) => {
    // Use directly imported function
    const aliases = loadAliases();
    const aliasValue = aliases[name];
    
    if (!aliasValue) {
      console.error(`Alias '${name}' not found`);
      return;
    }
    
    // Get the command and replace args placeholders
    let command = aliasValue;
    if (args.length > 0) {
      // Replace $1, $2, etc. with args
      args.forEach((arg, index) => {
        command = command.replace(`$${index + 1}`, arg);
      });
    }
    
    console.log(`Running command: ${command}`);
    // In a real implementation, you'd execute this command
    // But for now, just show what would be executed
  });

// Configuration commands
const configCommand = codexCLI
  .command('config')
  .description('Manage configuration settings')
  .action(() => {
    // Show all config settings when just "ccli config" is run
    // This essentially does the same as "ccli config get" with no arguments
    commands.handleConfig();
  });

// Keep the subcommands as they are
configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key: string, value: string) => {
    commands.configSet(key, value);
  });

configCommand
  .command('get [key]')
  .description('Get configuration values')
  .action((key?: string) => {
    commands.handleConfig(key);
  });

// List command
codexCLI
  .command('list')
  .description('List all entries')
  .option('-k, --keys-only', 'Only show keys')
  .option('-f, --format <format>', 'Output format (json, yaml, text)')
  .action((options: { keysOnly?: boolean, format?: string }) => {
    commands.getEntry(undefined, options);
  });

// Examples command
codexCLI
  .command('examples')
  .description('Initialize with example data files')
  .option('-f, --force', 'Force overwrite if examples already exist')
  .action((options: { force?: boolean }) => {
    commands.initializeExampleData(options.force);
  });

// Export command
codexCLI
  .command('export <type>')
  .description('Export data or aliases to a file')
  .option('-f, --format <format>', 'Output format (json, yaml)')
  .option('-o, --output <file>', 'Output file path')
  .action((type: string, options: { format?: string, output?: string }) => {
    commands.exportData(type, options);
  });

// Import command
codexCLI
  .command('import <type> <file>')
  .description('Import data or aliases from a file')
  .option('-f, --format <format>', 'Format of input file')
  .action((type: string, file: string, options: { format?: string }) => {
    commands.importData(type, file, options);
  });

// Reset command
codexCLI
  .command('reset <type>')
  .description('Reset data or aliases to empty state')
  .option('-f, --force', 'Skip confirmation')
  .action((type: string, options: { force?: boolean }) => {
    commands.resetData(type, options.force);
  });

  // Show help command
codexCLI
  .command('help')
  .description('Show detailed help information')
  .action(() => {
    showHelp();
  });

// Check if any command was specified
if (process.argv.length <= 2) {
  // When no command is provided, show our custom help instead of Commander's default
  showHelp();
} else {
  // Otherwise parse as normal
  codexCLI.parse(process.argv);
}
