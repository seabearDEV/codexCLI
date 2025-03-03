#!/usr/bin/env node

/**
 * Main entry point for CodexCLI application
 * 
 * This file sets up the command-line interface using Commander.js,
 * defines all available commands and their behaviors, and handles execution flow.
 */
import { Command } from 'commander';  // Command line arguments parser
import { showHelp } from './formatting';
import { addEntry, getEntry, listEntries, removeEntry, searchEntries, initializeExampleData, exportData, importData, resetData, handleConfig } from './commands';
import { setAlias, removeAlias, resolveKey, loadAliases } from './alias';
import chalk from 'chalk';

// Initialize the main command object
const codexCLI = new Command();

/**
 * Basic CLI configuration
 * Sets version and description shown in help output
 */
codexCLI
  .version('1.0.0')
  .description('CodexCLI - Command Line Information Store');

/**
 * Global CLI options
 * --debug: Enables verbose logging for troubleshooting
 */
codexCLI
  .option('--debug', 'Enable debug output')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().debug) {
      process.env.DEBUG = 'true';
    }
  });

/**
 * Command: add
 * Stores a new entry or updates an existing one in the database
 * @param {string} key - Unique identifier for the entry
 * @param {string[]} value - Array of strings that will be joined into a single value
 */
codexCLI
  .command('add <key> <value...>')
  .description('Add or update an entry')
  .action((key, valueArray) => {
    const resolvedKey = resolveKey(key);
    const value = valueArray.join(' ');
    addEntry(resolvedKey, value);
  });

/**
 * Command: get
 * Retrieves and displays a stored entry by its key
 * @param {string} key - The identifier to look up
 * @param {object} options - Command options (--raw for unformatted output)
 */
codexCLI
  .command('get <key>')
  .description('Retrieve an entry')
  .option('--raw', 'Output raw value without formatting')
  .option('--tree', 'Display hierarchical data in a tree structure')
  .action((key, options) => {
    const resolvedKey = resolveKey(key);
    getEntry(resolvedKey, options);
  });

/**
 * Command: list
 * Displays all stored entries, optionally filtered by path
 * @param {string} [path] - Optional path to filter entries
 */
codexCLI
  .command('list [path]')
  .description('List all entries or entries under specified path')
  .option('--tree', 'Display hierarchical data in a tree structure')
  .action((path, options) => {
    // Debug log to verify option parsing
    if (process.env.DEBUG === 'true') {
      console.log('Command options:', options);
    }
    listEntries(path, options);
  });

/**
 * Command: find
 * Searches entries by key or value containing the search term
 * @param {string} term - Search term to look for in keys and values
 */
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
  .argument('<action>', 'Action to perform: set, get, list, remove')
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
        if (!alias) return console.error('Alias name is required');
        
        const aliases = loadAliases();
        console.log(aliases[alias] 
          ? `Alias '${chalk.green(alias)}' points to '${chalk.cyan(aliases[alias])}'` 
          : `Alias '${chalk.yellow(alias)}' not found`);
      },
      list: () => {
        const allAliases = loadAliases();
        if (Object.keys(allAliases).length === 0) {
          return console.log('No aliases defined');
        }
        console.log(chalk.bold('Defined aliases:'));
        Object.entries(allAliases).forEach(([alias, targetPath]) => {
          console.log(`${chalk.green(alias.padEnd(15))} ${chalk.gray('→')} ${chalk.cyan(targetPath)}`);
        });
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
      console.log('Valid actions: set, get, list, remove');
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
