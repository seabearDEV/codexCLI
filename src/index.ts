#!/usr/bin/env node

import { Command } from 'commander';
import * as commands from './commands';
import { setAlias, removeAlias, loadAliases, resolveKey } from './alias';
import { showHelp, color } from './formatting';
import { version } from '../package.json';
import { getCompletions, generateBashScript, generateZshScript, installCompletions } from './completions';

// Early-exit handler for shell tab-completion (must run before Commander parses args)
const completionFlagIndex = process.argv.indexOf('--get-completions');
if (completionFlagIndex !== -1) {
  const compLine = process.argv[completionFlagIndex + 1] || '';
  const compPoint = parseInt(process.argv[completionFlagIndex + 2] || '0', 10) || compLine.length;
  getCompletions(compLine, compPoint).forEach(r => console.log(r));
  process.exit(0);
}

// Initialize the CLI
const codexCLI = new Command();
codexCLI.version(version);
codexCLI.description('A CLI tool for storing and retrieving code snippets, commands, and knowledge');

// Add global debug option
codexCLI.option('--debug', 'Enable debug mode')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().debug) {
      process.env.DEBUG = 'true';
    }
  });

// Add command
codexCLI
  .command('add <key> <value...>')
  .alias('a')
  .description('Add or update an entry')
  .action((key: string, valueArray: string[]) => {
    commands.addEntry(key, valueArray.join(' '));
  });

// Get command
codexCLI
  .command('get [key]')
  .alias('g')
  .description('Retrieve entries or specific data')
  .option('-f, --format <format>', 'Output format (json, yaml, text)')
  .option('-t, --tree', 'Display data in a hierarchical tree structure')
  .option('-r, --raw', 'Output raw values without formatting')
  .action((key: string | undefined, options: { format?: string, tree?: boolean, raw?: boolean }) => {
    if (key) {
      key = resolveKey(key);
    }
    commands.getEntry(key, options);
  });

// Find command
codexCLI
  .command('find <term>')
  .alias('f')
  .description('Find entries by key or value')
  .option('-k, --keys-only', 'Only search in keys')
  .option('-v, --values-only', 'Only search in values')
  .option('-t, --tree', 'Display results in a hierarchical tree structure')
  .action((term: string, options: { keysOnly?: boolean, valuesOnly?: boolean, tree?: boolean }) => {
    commands.searchEntries(term, {
      keysOnly: options.keysOnly,
      valuesOnly: options.valuesOnly,
      tree: options.tree
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
  .alias('a')
  .description('Add a new command alias')
  .action((name: string, commandArray: string[]) => {
    setAlias(name, commandArray.join(' '));
  });

aliasCommand
  .command('remove <name>')
  .alias('rm')
  .description('Remove an alias')
  .action((name: string) => {
    removeAlias(name);
  });

aliasCommand
  .command('get [name]')
  .alias('g')
  .description('List all aliases or get a specific alias')
  .option('-t, --tree', 'Display data in a hierarchical tree structure')
  .option('-f, --format <format>', 'Output format (json, yaml, text)')
  .action((name: string, options: { tree?: boolean, format?: string }) => {
    const aliases = loadAliases();
    
    if (options.tree) {
      console.log('\n' + color.boldColors.magenta('Aliases (Tree View):'));
      
      if (Object.keys(aliases).length === 0) {
        console.log(color.gray('  No aliases found.'));
      } else {
        if (name) {
          const aliasValue = aliases[name];
          
          if (!aliasValue) {
            console.error(color.red(`Alias '${name}' not found`));
            return;
          }
          
          const singleAlias = { [name]: aliasValue };
          displayAliasesAsTree(singleAlias);
        } else {
          displayAliasesAsTree(aliases);
        }
      }
      console.log();
      return;
    }
    
    if (!name) {
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
    commands.handleConfig();
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
    commands.resetData(type, options);
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

// Show help command
codexCLI
  .command('help')
  .description('Show detailed help information')
  .action(() => {
    showHelp();
  });

// Show custom help if no command is specified
if (process.argv.length <= 2) {
  showHelp();
} else {
  codexCLI.parse(process.argv);
}

function displayAliasesAsTree(aliases: Record<string, string>): void {
  console.log('');
  console.log('└── Aliases');
  Object.entries(aliases).forEach(([aliasName, aliasValue], index, array) => {
    const isLast = index === array.length - 1;
    const prefix = isLast ? '    └── ' : '    ├── ';
    console.log(`${prefix}${color.cyan(aliasName)}: ${color.green(aliasValue)}`);
  });
}
