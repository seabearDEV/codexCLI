#!/usr/bin/env node

import { Command } from 'commander';
import * as commands from './commands';
import { removeAlias, resolveKey, loadAliases } from './alias';
import { showHelp, showExamples } from './formatting';
import { askPassword, askConfirmation, printError } from './commands/helpers';
import { version } from '../package.json';
import { getCompletions, generateBashScript, generateZshScript, installCompletions } from './completions';
import { withPager } from './utils/pager';
import { getDataDirectory } from './utils/paths';
import { getBinaryName } from './utils/binaryName';
import fs from 'fs';
import { DEFAULT_LLM_INSTRUCTIONS, getEffectiveInstructions } from './llm-instructions';
import { logToolCall } from './utils/telemetry';
import { logAudit, sanitizeValue, sanitizeParams } from './utils/audit';
import { getValue } from './storage';

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

// Helper for CLI audit logging: capture a value for before/after comparison
function captureCliValue(key: string, global?: boolean): string | undefined {
  try {
    const scope = global ? 'global' as const : undefined;
    const val = getValue(key, scope);
    if (val === undefined) return undefined;
    return sanitizeValue(typeof val === 'object' ? JSON.stringify(val) : String(val));
  } catch { return undefined; }
}

// Initialize the CLI
const codexCLI = new Command();
codexCLI.name(getBinaryName());
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
  .description('Set an entry, or batch set with key=val pairs')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('-e, --encrypt', 'Encrypt the value with a password')
  .option('-a, --alias <name>', 'Create an alias for this key')
  .option('-p, --prompt', 'Read value interactively (avoids shell expansion of $, !, etc.)')
  .option('-s, --show', 'Show input when using --prompt (default is masked)')
  .option('-c, --clear', 'Clear terminal and scrollback after setting (removes sensitive input from history)')
  .option('--confirm', 'Require confirmation before running this entry')
  .option('--no-confirm', 'Remove confirmation requirement from this entry')
  .option('-G, --global', 'Target global data store')
  .action(async (key: string, valueArray: string[], options: { force?: boolean, encrypt?: boolean, alias?: string, prompt?: boolean, show?: boolean, clear?: boolean, confirm?: boolean, global?: boolean }) => {
    void logToolCall('codex_set', key, 'cli', options.global ? 'global' : undefined);
    // Batch mode: `set a=1 b=2 c=3`
    if (key.includes('=')) {
      const pairs = [key, ...valueArray];
      for (const pair of pairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
          printError(`Invalid batch pair '${pair}'. Expected key=value format.`);
          process.exitCode = 1;
          return;
        }
        const k = pair.slice(0, eqIdx);
        const v = pair.slice(eqIdx + 1);
        if (!k) {
          printError(`Invalid batch pair '${pair}'. Key cannot be empty.`);
          process.exitCode = 1;
          return;
        }
        const rk = resolveKey(k);
        const prevExitCode = process.exitCode;
        const before = captureCliValue(rk, options.global);
        await commands.setEntry(rk, v, options.force);
        const after = captureCliValue(rk, options.global);
        const success = process.exitCode === prevExitCode && JSON.stringify(before) !== JSON.stringify(after);
        void logAudit({ src: 'cli', tool: 'codex_set', op: 'write', key: rk, scope: options.global ? 'global' : 'auto', success, before, after, params: sanitizeParams({ key: rk, value: v }) });
      }
      return;
    }

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
      // Read from stdin if piped (non-TTY)
      if (!process.stdin.isTTY) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
        }
        const stdinValue = Buffer.concat(chunks).toString('utf8').trimEnd();
        if (stdinValue.length > 0) {
          value = stdinValue;
        } else if (!options.alias && options.confirm === undefined) {
          printError('No input received from stdin.');
          process.exitCode = 1;
          return;
        }
        // value stays undefined — intentional for alias-only or confirm-only updates
      } else if (!options.alias && options.confirm === undefined) {
        // Allow no value when -a or --confirm/--no-confirm is provided (metadata-only update)
        printError('Missing value. Provide a value or use --prompt (-p) to enter it interactively.');
        process.exitCode = 1;
        return;
      }
    } else {
      value = valueArray.join(' ');
    }
    const resolvedKey = resolveKey(key);
    const prevExitCode = process.exitCode;
    const before = captureCliValue(resolvedKey, options.global);
    await commands.setEntry(resolvedKey, value, options.force, options.encrypt, options.alias, options.confirm, options.global);
    const after = captureCliValue(resolvedKey, options.global);
    const success = process.exitCode === prevExitCode && JSON.stringify(before) !== JSON.stringify(after);
    void logAudit({ src: 'cli', tool: 'codex_set', op: 'write', key: resolvedKey, scope: options.global ? 'global' : 'auto', success, before, after, params: sanitizeParams({ key: resolvedKey, value: value ?? '' }) });
    if (options.clear) {
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    }
  });

// Get command
codexCLI
  .command('get [key]')
  .alias('g')
  .description('List keys or retrieve entries (-v for values)')
  .option('-t, --tree', 'Display data in a hierarchical tree structure')
  .option('-r, --raw', 'Output plain text without colors (for scripting)')
  .option('-s, --source', 'Show stored value before interpolation')
  .option('-d, --decrypt', 'Decrypt an encrypted value (prompts for password)')
  .option('-c, --copy', 'Copy value to clipboard')
  .option('-a, --aliases', 'Show aliases only')
  .option('-v, --values', 'Include values in output')
  .option('-k, --depth <n>', 'Limit key depth (e.g. -k 1 for top-level only)', parseInt)
  .option('-j, --json', 'Output as JSON (for scripting)')
  .option('-G, --global', 'Target global data store')
  .option('-A, --all', 'Show entries from all scopes (project + global)')
  .action(async (key: string | undefined, options: { tree?: boolean, raw?: boolean, source?: boolean, decrypt?: boolean, copy?: boolean, aliases?: boolean, values?: boolean, depth?: number, json?: boolean, global?: boolean, all?: boolean }) => {
    void logToolCall('codex_get', key, 'cli', options.global ? 'global' : undefined);
    if (key) {
      key = resolveKey(key);
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
  .option('-c, --capture', 'Capture output for piping (instead of inheriting stdio)')
  .option('--source', 'Output command to stdout for shell eval (used by shell wrapper)')
  .option('--chain', 'Treat stored value as space-separated key references to resolve and chain')
  .option('-G, --global', 'Target global data store')
  .action(async (keys: string[], options: { yes?: boolean, dry?: boolean, decrypt?: boolean, capture?: boolean, source?: boolean, chain?: boolean, global?: boolean }) => {
    void logToolCall('codex_run', keys[0], 'cli', options.global ? 'global' : undefined);
    await commands.runCommand(keys, options);
  });

// Copy command
codexCLI
  .command('copy <source> <dest>')
  .alias('cp')
  .description('Copy an entry to a new key')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('-G, --global', 'Target global data store')
  .action(async (source: string, dest: string, options: { force?: boolean, global?: boolean }) => {
    void logToolCall('codex_copy', dest, 'cli', options.global ? 'global' : undefined);
    const before = captureCliValue(dest, options.global);
    await commands.copyEntry(resolveKey(source), dest, options.force, options.global);
    const after = captureCliValue(dest, options.global);
    void logAudit({ src: 'cli', tool: 'codex_copy', op: 'write', key: dest, scope: options.global ? 'global' : 'auto', success: true, before, after, params: { source, dest } });
  });

// Find command
codexCLI
  .command('find <term>')
  .alias('f')
  .description('Find entries by key or value')
  .option('-e, --entries', 'Search only in data entries')
  .option('-a, --aliases', 'Search only in aliases')
  .option('-t, --tree', 'Display results in a hierarchical tree structure')
  .option('-j, --json', 'Output as JSON (for scripting)')
  .option('-x, --regex', 'Treat search term as a regular expression')
  .option('-k, --keys', 'Search keys only (skip value matching)')
  .option('-v, --values', 'Search values only (skip key matching)')
  .option('-G, --global', 'Target global data store')
  .action(async (term: string, options: { entries?: boolean, aliases?: boolean, tree?: boolean, json?: boolean, regex?: boolean, keys?: boolean, values?: boolean, global?: boolean }) => {
    void logToolCall('codex_search', term, 'cli', options.global ? 'global' : undefined);
    await withPager(() => commands.searchEntries(term, options));
  });

// Edit command
codexCLI
  .command('edit <key>')
  .alias('e')
  .description('Open an entry in $EDITOR for editing')
  .option('-d, --decrypt', 'Decrypt an encrypted value before editing')
  .option('-G, --global', 'Target global data store')
  .action(async (key: string, options: { decrypt?: boolean, global?: boolean }) => {
    void logToolCall('codex_set', key, 'cli', options.global ? 'global' : undefined);
    await commands.editEntry(resolveKey(key), options);
  });

// Rename command
codexCLI
  .command('rename <old> <new>')
  .alias('rn')
  .description('Rename an entry key or alias')
  .option('-a, --alias', 'Rename an alias instead of an entry key')
  .option('--set-alias <name>', 'Set an alias on the renamed key')
  .option('-G, --global', 'Target global data store')
  .action((oldName: string, newName: string, options: { alias?: boolean, setAlias?: string, global?: boolean }) => {
    void logToolCall('codex_rename', oldName, 'cli', options.global ? 'global' : undefined);
    const resolvedOld = options.alias ? oldName : resolveKey(oldName);
    const before = captureCliValue(resolvedOld, options.global);
    if (options.alias) {
      commands.renameEntry(oldName, newName, true, undefined, options.global);
    } else {
      commands.renameEntry(resolvedOld, newName, false, options.setAlias, options.global);
    }
    const after = captureCliValue(newName, options.global);
    void logAudit({ src: 'cli', tool: 'codex_rename', op: 'write', key: resolvedOld, scope: options.global ? 'global' : 'auto', success: true, before, after, params: { oldKey: resolvedOld, newKey: newName } });
  });

// Remove command
codexCLI
  .command('remove <key>')
  .alias('rm')
  .description('Remove an entry')
  .option('-a, --alias', 'Remove the alias only (keep the entry)')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('-G, --global', 'Target global data store')
  .action(async (key: string, options: { alias?: boolean, force?: boolean, global?: boolean }) => {
    const tool = options.alias ? 'codex_alias_remove' : 'codex_remove';
    void logToolCall(tool, key, 'cli', options.global ? 'global' : undefined);
    const resolvedKey = options.alias ? key : resolveKey(key);
    if (options.alias) {
      const scope = options.global ? 'global' as const : undefined;
      const aliases = loadAliases(scope);
      const before = aliases[key];
      const removed = removeAlias(key, scope);
      if (removed) {
        console.log(`Alias '${key}' removed successfully.`);
        void logAudit({ src: 'cli', tool, op: 'write', key: resolvedKey, scope: options.global ? 'global' : 'auto', success: true, before, after: undefined, params: { key: resolvedKey } });
      } else {
        console.error(`Alias '${key}' not found.`);
        process.exitCode = 1;
        void logAudit({ src: 'cli', tool, op: 'write', key: resolvedKey, scope: options.global ? 'global' : 'auto', success: false, error: 'Alias not found', params: { key: resolvedKey } });
      }
    } else {
      const targetScope = options.global ? 'global' as const : 'project' as const;
      const beforeInTargetScope = getValue(resolvedKey, targetScope);
      const before = captureCliValue(resolvedKey, options.global);
      await commands.removeEntry(resolvedKey, options.force, options.global);
      const afterInTargetScope = getValue(resolvedKey, targetScope);
      const after = captureCliValue(resolvedKey, options.global);
      const removed = beforeInTargetScope !== undefined && afterInTargetScope === undefined;
      void logAudit({ src: 'cli', tool, op: 'write', key: resolvedKey, scope: options.global ? 'global' : 'auto', success: removed, before, after, params: { key: resolvedKey } });
    }
  });

// Stale entries command
codexCLI
  .command('stale [days]')
  .description('Show entries not updated in N days (default: 30)')
  .option('-j, --json', 'Output as JSON')
  .option('-G, --global', 'Target global data store')
  .action(async (days: string | undefined, options: { json?: boolean, global?: boolean }) => {
    void logToolCall('codex_stale', undefined, 'cli', options.global ? 'global' : undefined);
    const { loadMeta, loadMetaMerged } = await import('./store');
    const { getEntriesFlat } = await import('./storage');
    const { color } = await import('./formatting');
    const threshold = parseInt(days ?? '30', 10);
    if (isNaN(threshold) || threshold < 0) {
      console.error(color.red('Error: days must be a non-negative integer.'));
      process.exitCode = 1;
      return;
    }
    const scope = options.global ? 'global' as const : undefined;
    const meta = scope ? loadMeta(scope) : loadMetaMerged();
    const flat = getEntriesFlat(scope);
    const cutoff = Date.now() - threshold * 86400000;
    const stale: { key: string; age: number; lastUpdated: number | undefined }[] = [];
    for (const key of Object.keys(flat)) {
      const ts = meta[key];
      if (ts === undefined || ts < cutoff) {
        stale.push({ key, age: ts ? Math.floor((Date.now() - ts) / 86400000) : -1, lastUpdated: ts });
      }
    }
    if (options.json) {
      console.log(JSON.stringify(stale, null, 2));
      return;
    }
    if (stale.length === 0) {
      console.log(color.green(`No entries older than ${threshold} days.`));
      return;
    }
    console.log(color.bold(`\n${stale.length} entries not updated in ${threshold}+ days:\n`));
    for (const { key, age } of stale) {
      const ageStr = age < 0 ? 'never tracked' : `${age}d ago`;
      const ageColor = age < 0 ? color.gray : age > 90 ? color.red : color.yellow;
      console.log(`  ${color.white(key.padEnd(40))} ${ageColor(ageStr)}`);
    }
    console.log('');
  });

// Lint command
codexCLI
  .command('lint')
  .description('Check entries against the recommended namespace schema')
  .option('-j, --json', 'Output as JSON')
  .option('-G, --global', 'Target global data store')
  .action((options: { json?: boolean, global?: boolean }) => {
    void logToolCall('codex_lint', undefined, 'cli', options.global ? 'global' : undefined);
    commands.lintEntries(options);
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
    void logToolCall('codex_config_set', key, 'cli', 'global');
    commands.configSet(key, value);
  });

configCommand
  .command('get [key]')
  .description('Get configuration values')
  .action(async (key?: string) => {
    void logToolCall('codex_config_get', key, 'cli', 'global');
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

configCommand
  .command('llm-instructions')
  .description('Show the LLM instructions sent to AI agents via MCP')
  .option('--default', 'Show only the built-in defaults (exclude custom additions)')
  .action(async (options: { default?: boolean }) => {
    const text = options.default ? DEFAULT_LLM_INSTRUCTIONS : getEffectiveInstructions();
    await withPager(() => { process.stdout.write(text + '\n'); });
  });

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
  .description('Manage stored data (export, import, reset)');

dataCommand
  .command('export <type>')
  .description('Export data or aliases to a file')
  .option('-o, --output <file>', 'Output file path')
  .option('--pretty', 'Pretty-print the output')
  .option('-G, --global', 'Export from global data store only')
  .option('-P, --project', 'Export from project data store only')
  .action(async (type: string, options: { format?: string, output?: string, pretty?: boolean, global?: boolean, project?: boolean }) => {
    void logToolCall('codex_export', undefined, 'cli', options.global ? 'global' : options.project ? 'project' : undefined);
    await withPager(() => commands.exportData(type, options));
  });

dataCommand
  .command('import <type> <file>')
  .description('Import data or aliases from a file')
  .option('-m, --merge', 'Merge with existing data instead of replacing')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('-p, --preview', 'Preview changes without modifying data')
  .option('-G, --global', 'Import into global data store')
  .option('-P, --project', 'Import into project data store')
  .action(async (type: string, file: string, options: { format?: string, merge?: boolean, force?: boolean, preview?: boolean, global?: boolean, project?: boolean }) => {
    void logToolCall('codex_import', undefined, 'cli', options.global ? 'global' : options.project ? 'project' : undefined);
    await commands.importData(type, file, options);
  });

dataCommand
  .command('reset <type>')
  .description('Reset data or aliases to empty state')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('-G, --global', 'Reset global data store only')
  .option('-P, --project', 'Reset project data store only')
  .action(async (type: string, options: { force?: boolean, global?: boolean, project?: boolean }) => {
    void logToolCall('codex_reset', undefined, 'cli', options.global ? 'global' : options.project ? 'project' : undefined);
    await commands.resetData(type, options);
  });

dataCommand
  .command('projectfile', { hidden: true })
  .description('Create or remove a project-scoped .codexcli.json')
  .option('--remove', 'Remove the project file')
  .action((options: { remove?: boolean }) => {
    commands.handleProjectFile(options);
  });

// Init command: create/remove project-scoped data file
codexCLI
  .command('init')
  .description('Create a project-scoped .codexcli.json in the current directory')
  .option('--remove', 'Remove the project file')
  .option('--scaffold', 'Auto-populate from project files (package.json, go.mod, etc.)')
  .action((options: { remove?: boolean; scaffold?: boolean }) => {
    void logToolCall('codex_init', undefined, 'cli', 'project');
    commands.handleProjectFile(options);
  });

// Stats command: telemetry and usage trends
codexCLI
  .command('stats')
  .description('View usage telemetry and effectiveness trends')
  .option('-p, --period <period>', 'Time period: 7d, 30d, 90d, all', '30d')
  .option('--json', 'Output raw JSON')
  .action(async (options: { period: string; json?: boolean }) => {
    const { computeStats } = await import('./utils/telemetry');
    const { parsePeriodDays } = await import('./utils');
    const stats = computeStats(parsePeriodDays(options.period));

    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    const { color } = await import('./formatting');

    if (stats.totalCalls === 0) {
      console.log(color.gray('No telemetry data yet. Usage is tracked automatically via CLI and MCP.'));
      return;
    }

    console.log(color.bold(`\nCodexCLI Usage Stats (${stats.period === 'all' ? 'all time' : `last ${stats.period}`})`));
    console.log('');
    console.log(`  MCP sessions:    ${color.white(String(stats.mcpSessions))}`);
    console.log(`  MCP calls:       ${color.white(String(stats.mcpCalls))}`);

    if (stats.mcpSessions > 0) {
      const bootstrapPct = (stats.bootstrapRate * 100).toFixed(0);
      const bootstrapColor = stats.bootstrapRate >= 0.8 ? color.green : stats.bootstrapRate >= 0.5 ? color.yellow : color.red;
      console.log(`    Bootstrap rate:  ${bootstrapColor(`${bootstrapPct}%`)} of sessions call codex_context first`);

      const writeBackPct = (stats.writeBackRate * 100).toFixed(0);
      const writeBackColor = stats.writeBackRate >= 0.5 ? color.green : stats.writeBackRate >= 0.25 ? color.yellow : color.red;
      console.log(`    Write-back rate: ${writeBackColor(`${writeBackPct}%`)} of sessions store at least 1 entry`);
    }

    console.log(`  CLI calls:       ${color.white(String(stats.cliCalls))}`);
    console.log(`  Total calls:     ${color.white(String(stats.totalCalls))}`);
    console.log(`  Read:write:      ${color.white(stats.readWriteRatio)} (${stats.reads} reads, ${stats.writes} writes, ${stats.execs} execs)`);

    const { project, global: glob, unscoped } = stats.scopeBreakdown;
    if (project > 0 || glob > 0) {
      const parts = [];
      if (project > 0) parts.push(`${project} project`);
      if (glob > 0) parts.push(`${glob} global`);
      if (unscoped > 0) parts.push(`${unscoped} unscoped`);
      console.log(`  Scope:           ${color.white(parts.join(', '))}`);
    }

    if (Object.keys(stats.namespaceCoverage).length > 0) {
      console.log(color.bold('\nNamespace activity:'));
      const sorted = Object.entries(stats.namespaceCoverage)
        .sort(([, a], [, b]) => (b.reads + b.writes) - (a.reads + a.writes));
      for (const [ns, data] of sorted) {
        const age = data.lastWrite ? `${Math.floor((Date.now() - data.lastWrite) / 86400000)}d ago` : 'never';
        const ageColor = data.lastWrite && (Date.now() - data.lastWrite) < 7 * 86400000 ? color.green : color.gray;
        console.log(`  ${color.white(ns.padEnd(20))} ${String(data.reads).padStart(3)} reads  ${String(data.writes).padStart(3)} writes  last write: ${ageColor(age)}`);
      }
    }

    if (stats.topTools.length > 0) {
      console.log(color.bold('\nTop tools:'));
      for (const { tool, count } of stats.topTools) {
        console.log(`  ${color.white(tool.padEnd(24))} ${count} calls`);
      }
    }
    console.log('');
  });

// Audit log command
codexCLI
  .command('audit [key]')
  .description('View the audit log of data mutations')
  .option('-p, --period <period>', 'Time period: 7d, 30d, 90d, all', '30d')
  .option('-w, --writes', 'Show only write operations')
  .option('--mcp', 'Show only MCP operations')
  .option('--cli', 'Show only CLI operations')
  .option('--project <path>', 'Filter by project directory path')
  .option('--hits', 'Show only reads that returned data')
  .option('--misses', 'Show only reads that found nothing')
  .option('--redundant', 'Show only writes where value didn\'t change')
  .option('-j, --json', 'Output as JSON')
  .option('-n, --limit <n>', 'Max entries to show (default: 50)', parseInt)
  .action(async (key: string | undefined, options: { period: string; writes?: boolean; mcp?: boolean; cli?: boolean; project?: string; hits?: boolean; misses?: boolean; redundant?: boolean; json?: boolean; limit?: number }) => {
    const { showAuditLog } = await import('./commands/audit');
    await withPager(() => showAuditLog(key, options));
  });

// MCP server subcommand: allows binary/Homebrew installs to run the MCP server
codexCLI
  .command('mcp-server')
  .description('Start the MCP (Model Context Protocol) server over stdio')
  .option('--cwd <dir>', 'Set working directory (enables project-scoped data detection)')
  .option('--agent <name>', 'Agent identity for audit logging')
  .action(async (options: { cwd?: string; agent?: string }) => {
    if (options.agent) {
      process.env.CODEX_AGENT_NAME = options.agent;
    }
    const projectDir = process.env.CODEX_PROJECT_DIR ?? options.cwd;
    if (projectDir) {
      process.chdir(projectDir);
    }
    const { startMcpServer } = await import('./mcp-server');
    await startMcpServer();
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
  const bin = getBinaryName();
  console.log(`Welcome to CodexCLI! Run \`${bin} config examples\` to see usage patterns.`);

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
    console.log(`Skipped. Run \`${bin} config completions install\` later to set up.`);
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
    // Fix nested subcommand --help routing (Commander v13 can't route --help
    // for nested subcommands when required positional args are missing)
    if (userArgs.includes('--help') || userArgs.includes('-h')) {
      const helpFreeArgs = userArgs.filter(a => a !== '--help' && a !== '-h');
      if (helpFreeArgs.length >= 2) {
        const parentCmd = codexCLI.commands.find(c => c.name() === helpFreeArgs[0]);
        if (parentCmd) {
          const subCmd = parentCmd.commands.find(c => c.name() === helpFreeArgs[1]);
          if (subCmd) {
            subCmd.help();
          }
        }
      }
    }
    codexCLI.parse(process.argv);
  }
})();
