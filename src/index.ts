#!/usr/bin/env node

import { Command } from 'commander';
import * as commands from './commands'; 
import { setAlias, removeAlias, loadAliases } from './alias';
import { showHelp, color } from './formatting';
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
  .option('-t, --tree', 'Display data in a hierarchical tree structure')  // Add this line
  .option('-r, --raw', 'Output raw values without formatting')          // Also add this option
  .action((key: string | undefined, options: { format?: string, tree?: boolean, raw?: boolean }) => {
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
  .command('get [name]')
  .description('List all aliases or get a specific alias')
  .option('-t, --tree', 'Display data in a hierarchical tree structure')
  .option('-f, --format <format>', 'Output format (json, yaml, text)')
  .action((name: string, options: { tree?: boolean, format?: string }) => {
    // Use directly imported function
    const aliases = loadAliases();
    
    // Add tree view support
    if (options.tree) {
      console.log('\n' + color.boldColors.magenta('Aliases (Tree View):'));
      
      if (Object.keys(aliases).length === 0) {
        console.log(color.gray('  No aliases found.'));
      } else {
        // If a specific name was provided, only show that alias
        if (name) {
          const aliasValue = aliases[name];
          
          if (!aliasValue) {
            console.error(color.red(`Alias '${name}' not found`));
            return;
          }
          
          // Display just this alias in tree format
          const singleAlias = { [name]: aliasValue };
          displayAliasesAsTree(singleAlias);
        } else {
          // Display all aliases in tree format
          displayAliasesAsTree(aliases);
        }
      }
      console.log();
      return;
    }
    
    // Non-tree view (original code)
    if (!name) {
      // When no name provided, list all aliases
      console.log('\n' + color.boldColors.magenta('Aliases:'));
      
      if (Object.keys(aliases).length === 0) {
        console.log(color.gray('  No aliases found. Add one with "ccli alias add <name> <command>"'));
      } else {
        Object.entries(aliases).forEach(([alias, path]) => {
          console.log(`  ${color.cyan(alias)} -> ${color.green(path)}`);
        });
      }
      console.log();
      return;
    }
    
    // Show specific alias
    const aliasValue = aliases[name];
    
    if (!aliasValue) {
      console.error(color.red(`Alias '${name}' not found`));
      return;
    }
    
    console.log(`\n${color.cyan(name)} -> ${color.green(aliasValue)}\n`);
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

// Add this helper function in your file
function displayAliasesAsTree(aliases: Record<string, string>): void {
  console.log('');
  console.log('└── Aliases');
  Object.entries(aliases).forEach(([aliasName, aliasValue], index, array) => {
    const isLast = index === array.length - 1;
    const prefix = isLast ? '    └── ' : '    ├── ';
    console.log(`${prefix}${color.cyan(aliasName)}: ${color.green(aliasValue)}`);
  });
}
