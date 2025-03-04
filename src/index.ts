#!/usr/bin/env node

import { Command } from 'commander';
import { showHelp } from './formatting';
import { addEntry, getEntry, removeEntry, searchEntries, initializeExampleData, exportData, importData, resetData, handleConfig } from './commands';
import { setAlias, removeAlias, resolveKey, loadAliases } from './alias';
import chalk from 'chalk';

// Initialize the main command object
const codexCLI = new Command();

codexCLI
  .version('1.0.0')
  .description('CodexCLI - Command Line Information Store');

// Global options
codexCLI
  .option('--debug', 'Enable debug output')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().debug) {
      process.env.DEBUG = 'true';
    }
  });

// Add entry
codexCLI
  .command('add <key> <value...>')
  .description('Add or update an entry')
  .action((key, valueArray) => {
    const resolvedKey = resolveKey(key);
    const value = valueArray.join(' ');
    addEntry(resolvedKey, value);
  });

// Get entry or entries
codexCLI
  .command('get [key]')
  .description('Retrieve entries or specific data')
  .option('--raw', 'Output raw value without formatting')
  .option('--tree', 'Display hierarchical data in a tree structure')
  .action((key, options) => {
    const resolvedKey = key ? resolveKey(key) : undefined;
    getEntry(resolvedKey, options);
  });

// Search entries
codexCLI
  .command('find <term>')
  .description('Find entries by key or value')
  .option('--tree', 'Display hierarchical data in a tree structure')
  .action((term, options) => {
    searchEntries(term, options);
  });

/**
 * Command: remove
 * Deletes an entry from storage
 * @param {string} key - The identifier of the entry to remove
 */
codexCLI
  .command('remove <key>')
  .description('Remove an entry')
  .action((key) => {
    const resolvedKey = resolveKey(key);
    removeEntry(resolvedKey);
  });

/**
 * Command: config
 * View or change configuration settings
 */
codexCLI
  .command('config [setting] [value]')
  .description('View or change configuration settings')
  .option('--list', 'List all available settings and their current values')
  .addHelpText('after', `
  Available settings:
    colors       - Enable/disable colored output (true/false)
    theme        - Set UI theme (default/dark/light)
    editor       - Default editor for editing entries
    
  Examples:
    $ ccli config                  # View all current configuration
    $ ccli config colors           # View current 'colors' setting
    $ ccli config colors false     # Disable colored output
    $ ccli config --list           # List all available settings
  `)
  .action((setting, value, options) => {
    handleConfig(setting, value, options);
  });

/**
 * Command: help
 * Displays custom formatted help information
 */
codexCLI
  .command('help')
  .description('Display help information')
  .action(() => {
    showHelp();
  });

/**
 * Command: alias
 * Manages aliases for paths
 */
codexCLI
  .command('alias')
  .description('Manage aliases for paths')
  .argument('<action>', 'Action to perform: set, get, remove')
  .argument('[alias]', 'Alias name')
  .argument('[path]', 'Path for the alias (required for set action)')
  .action((action, alias, path) => {
    const actions = {
      set: () => {
        if (!alias || !path) {
          return console.error('Both alias and path are required for set action');
        }
        setAlias(alias, path);
        console.log(`Alias '${chalk.green(alias)}' now points to '${chalk.cyan(path)}'`);
      },
      get: () => {
        // If no alias name provided, show all aliases
        if (!alias) {
          const allAliases = loadAliases();
          if (Object.keys(allAliases).length === 0) {
            return console.log('No aliases defined');
          }
          console.log(chalk.bold('Defined aliases:'));
          Object.entries(allAliases).forEach(([alias, targetPath]) => {
            console.log(`${chalk.green(alias.padEnd(15))} ${chalk.gray('→')} ${chalk.cyan(targetPath)}`);
          });
          return;
        }
        
        // If alias name provided, show that specific alias
        const aliases = loadAliases();
        console.log(aliases[alias] 
          ? `Alias '${chalk.green(alias)}' points to '${chalk.cyan(aliases[alias])}'` 
          : `Alias '${chalk.yellow(alias)}' not found`);
      },
      remove: () => {
        if (!alias) return console.error('Alias name is required');
        
        console.log(removeAlias(alias)
          ? `Alias '${chalk.green(alias)}' removed`
          : `Alias '${chalk.yellow(alias)}' not found`);
      }
    };
    
    const handler = actions[action as keyof typeof actions];
    if (handler) {
      handler();
    } else {
      console.error(`Unknown action: ${action}`);
      console.log('Valid actions: set, get, remove');
    }
  });

/**
 * Command: examples
 * Initializes the data directory with example data files
 */
codexCLI
  .command('examples')
  .description('Initialize with example data files')
  .option('--force', 'Overwrite existing data files')
  .action((options) => {
    initializeExampleData(options.force);
  });

/**
 * Command: export
 * Exports data to a file
 */
codexCLI
  .command('export <type>')
  .description('Export data or aliases to a file')
  .option('-o, --output <file>', 'Output file path (defaults to current directory)')
  .option('--pretty', 'Format JSON with indentation for readability', true)
  .action((type, options) => {
    exportData(type, options);
  });

/**
 * Command: import
 * Imports data from a file
 */
codexCLI
  .command('import <type>')
  .description('Import data or aliases from a file')
  .argument('<file>', 'File to import')
  .option('--merge', 'Merge with existing data instead of replacing', false)
  .option('--force', 'Overwrite without confirmation', false)
  .action((type, file, options) => {
    importData(type, file, options);
  });

/**
 * Command: reset
 * Resets data or aliases to empty state
 */
codexCLI
  .command('reset <type>')
  .description('Reset data or aliases to empty state')
  .option('--force', 'Reset without confirmation', false)
  .action((type, options) => {
    resetData(type, options);
  });

/**
 * Error handler for invalid commands
 * Displays error message, shows help, and exits with error code
 */
codexCLI.on('command:*', () => {
  console.error('Invalid command: %s\n', codexCLI.args.join(' '));
  showHelp();
  process.exit(1);
});

/**
 * Default behavior: show help when no command is provided
 */
if (process.argv.length <= 2) {
  showHelp();
} else {
  codexCLI.parse(process.argv);
}
