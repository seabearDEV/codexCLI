#!/usr/bin/env node

import { Command } from 'commander';
import * as commands from './commands';
import { removeAlias, resolveKey } from './alias';
import { showHelp, showExamples } from './formatting';
import { askPassword, askConfirmation, printError } from './commands/helpers';
import { version } from '../package.json';
import { getCompletions, generateBashScript, generateZshScript, installCompletions } from './completions';
import { withPager } from './utils/pager';
import { getDataDirectory } from './utils/paths';
import fs from 'fs';

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

codexCLI.helpCommand(false);

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
  .option('-f, --force', 'Skip confirmation prompt')
  .option('-e, --encrypt', 'Encrypt the value with a password')
  .option('-a, --alias <name>', 'Create an alias for this key')
  .option('-p, --prompt', 'Read value interactively (avoids shell expansion of $, !, etc.)')
  .option('-s, --show', 'Show input when using --prompt (default is masked)')
  .option('-c, --clear', 'Clear terminal and scrollback after setting (removes sensitive input from history)')
  .option('--confirm', 'Require confirmation before running this entry')
  .option('--no-confirm', 'Remove confirmation requirement from this entry')
  .action(async (key: string, valueArray: string[], options: { force?: boolean, encrypt?: boolean, alias?: string, prompt?: boolean, show?: boolean, clear?: boolean, confirm?: boolean }) => {
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
      // Allow no value when -a or --confirm/--no-confirm is provided (metadata-only update)
      if (!options.alias && options.confirm === undefined) {
        printError('Missing value. Provide a value or use --prompt (-p) to enter it interactively.');
        process.exitCode = 1;
        return;
      }
      value = undefined;
    } else {
      value = valueArray.join(' ');
    }
    await commands.setEntry(resolveKey(key.replace(/:$/, '')), value, options.force, options.encrypt, options.alias, options.confirm);
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
  .option('-s, --source', 'Show stored value before interpolation')
  .option('-d, --decrypt', 'Decrypt an encrypted value (prompts for password)')
  .option('-c, --copy', 'Copy value to clipboard')
  .option('-a, --aliases', 'Show aliases only')
  .action(async (key: string | undefined, options: { tree?: boolean, raw?: boolean, source?: boolean, decrypt?: boolean, copy?: boolean, aliases?: boolean }) => {
    if (key) {
      key = resolveKey(key.replace(/:$/, ''));
    }
    await withPager(() => commands.getEntry(key, options));
  });

// Run command
codexCLI
  .command('run <keys...>')
  .alias('r')
  .description('Execute stored command(s) (use : to compose, multiple keys &&-chain)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--dry', 'Print the command without executing')
  .option('-d, --decrypt', 'Decrypt an encrypted command before running')
  .option('--source', 'Output command to stdout for shell eval (used by shell wrapper)')
  .action(async (keys: string[], options: { yes?: boolean, dry?: boolean, decrypt?: boolean, source?: boolean }) => {
    await commands.runCommand(keys, options);
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

// Rename command
codexCLI
  .command('rename <old> <new>')
  .alias('rn')
  .description('Rename an entry key or alias')
  .option('-a, --alias', 'Rename an alias instead of an entry key')
  .option('--set-alias <name>', 'Set an alias on the renamed key')
  .action((oldName: string, newName: string, options: { alias?: boolean, setAlias?: string }) => {
    if (options.alias) {
      commands.renameEntry(oldName, newName, true);
    } else {
      commands.renameEntry(resolveKey(oldName.replace(/:$/, '')), newName, false, options.setAlias);
    }
  });

// Remove command
codexCLI
  .command('remove <key>')
  .alias('rm')
  .description('Remove an entry')
  .option('-a, --alias', 'Remove the alias only (keep the entry)')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (key: string, options: { alias?: boolean, force?: boolean }) => {
    if (options.alias) {
      const removed = removeAlias(key);
      if (removed) {
        console.log(`Alias '${key}' removed successfully.`);
      } else {
        console.error(`Alias '${key}' not found.`);
        process.exitCode = 1;
      }
    } else {
      await commands.removeEntry(resolveKey(key.replace(/:$/, '')), options.force);
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

// Config subcommands: info, examples, completions
configCommand
  .command('info')
  .description('Show version, stats, and storage info')
  .action(() => {
    commands.showInfo();
  });

configCommand
  .command('examples')
  .description('Show usage examples')
  .action(() => { void withPager(() => showExamples()); });

const completionsCommand = configCommand
  .command('completions')
  .description('Generate shell completion scripts')
  .helpCommand(false);

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

// Data management command group
const dataCommand = codexCLI
  .command('data')
  .description('Manage stored data (export, import, reset)')
  .helpCommand(false);

dataCommand
  .command('export <type>')
  .description('Export data or aliases to a file')
  .option('-o, --output <file>', 'Output file path')
  .option('--pretty', 'Pretty-print the output')
  .action(async (type: string, options: { format?: string, output?: string, pretty?: boolean }) => {
    await withPager(() => commands.exportData(type, options));
  });

dataCommand
  .command('import <type> <file>')
  .description('Import data or aliases from a file')
  .option('-m, --merge', 'Merge with existing data instead of replacing')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (type: string, file: string, options: { format?: string, merge?: boolean, force?: boolean }) => {
    await commands.importData(type, file, options);
  });

dataCommand
  .command('reset <type>')
  .description('Reset data or aliases to empty state')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (type: string, options: { force?: boolean }) => {
    await commands.resetData(type, options);
  });

// Hidden backward-compat shim: `ccli completions <bash|zsh|install>` still works
// (existing users have `eval "$(ccli completions zsh)"` in their RC files)
const completionsShim = codexCLI
  .command('completions', { hidden: true })
  .helpCommand(false);

completionsShim
  .command('bash')
  .action(() => { process.stdout.write(generateBashScript()); });

completionsShim
  .command('zsh')
  .action(() => { process.stdout.write(generateZshScript()); });

completionsShim
  .command('install')
  .action(() => { installCompletions(); });

// First-run: welcome message + optional completions install
async function handleFirstRun(): Promise<void> {
  if (fs.existsSync(getDataDirectory())) return;

  console.log();
  console.log('Welcome to CodexCLI! Run `ccli config examples` to see usage patterns.');

  if (!process.stdin.isTTY) {
    console.log();
    return;
  }

  const shell = process.env.SHELL ?? '';
  if (!shell.endsWith('/zsh') && !shell.endsWith('/bash')) {
    console.log();
    return;
  }

  console.log();
  const answer = await askConfirmation('Install shell completions and wrapper? [Y/n] ');
  if (answer.toLowerCase() !== 'n') {
    installCompletions();
  } else {
    console.log('Skipped. Run `ccli config completions install` later to set up.');
  }
  console.log();
}

void (async () => {
  await handleFirstRun();

  // Show rich help for: ccli, ccli --help, ccli -h, ccli help (with optional --debug)
  const userArgs = process.argv.slice(2).filter(a => a !== '--debug');
  const isRootHelp = userArgs.length === 0 ||
    (userArgs.length === 1 && ['--help', '-h', 'help'].includes(userArgs[0]));

  if (isRootHelp) {
    if (process.argv.includes('--debug')) process.env.DEBUG = 'true';
    void withPager(() => showHelp());
  } else {
    codexCLI.parse(process.argv);
  }
})();
