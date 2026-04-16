import { loadData, saveData, getValue, setValue, handleError, Scope, validateImportEntries, validateImportAliases, validateImportConfirm } from '../storage';
import { color } from '../formatting';
import fs from 'fs';
import { loadAliases, saveAliases } from '../alias';
import { loadConfirmKeys, saveConfirmKeys } from '../confirm';
import { CodexData, ExportOptions, ImportOptions, ResetOptions } from '../types';
import path from 'path';
import { validateDataType, validateResetType, confirmOrAbort, getInvalidDataTypeMessage, getInvalidResetTypeMessage, printSuccess, printError, printWarning } from './helpers';
import { deepMerge } from '../utils/deepMerge';
import { flattenObject, expandFlatKeys } from '../utils/objectPath';
import { maskEncryptedValues } from '../utils/crypto';
import { debug } from '../utils/debug';
import { createAutoBackup } from '../utils/autoBackup';
import { findProjectFile, clearProjectFileCache } from '../store';
import { getAuditPath } from '../utils/audit';
import { getTelemetryPath, getMissPathsPath } from '../utils/telemetry';
import { scanCodebase, ScaffoldEntry } from './scan';
import { generateClaudeMd } from './claude-md';

function resolveScope(options: { global?: boolean | undefined, project?: boolean | undefined }): Scope | undefined {
  if (options.global) return 'global';
  if (options.project) return 'project';
  return undefined;
}

export function exportData(type: string, options: ExportOptions): void {
  debug('exportData called', { type, options });
  try {
    if (!validateDataType(type)) {
      printError(getInvalidDataTypeMessage(type));
      return;
    }

    const scope = resolveScope(options);
    const defaultDir = process.cwd();
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const indent = options.pretty ? 2 : 0;

    // When exporting 'all' with -o, suffix the filename per type to avoid overwriting
    const getOutputFile = (typeName: string, defaultName: string): string => {
      if (!options.output) return path.join(defaultDir, defaultName);
      if (type !== 'all') return options.output;
      const ext = path.extname(options.output);
      const base = options.output.slice(0, options.output.length - ext.length);
      return `${base}-${typeName}${ext || '.json'}`;
    };

    if (type === 'entries' || type === 'all') {
      const outputFile = getOutputFile('entries', `codexcli-entries-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(maskEncryptedValues(loadData(scope)), null, indent), { encoding: 'utf8', mode: 0o600 });
      printSuccess(`Entries exported to: ${color.cyan(outputFile)}`);
    }

    if (type === 'aliases' || type === 'all') {
      const outputFile = getOutputFile('aliases', `codexcli-aliases-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(loadAliases(scope), null, indent), { encoding: 'utf8', mode: 0o600 });
      printSuccess(`Aliases exported to: ${color.cyan(outputFile)}`);
    }

    if (type === 'confirm' || type === 'all') {
      const outputFile = getOutputFile('confirm', `codexcli-confirm-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(loadConfirmKeys(scope), null, indent), { encoding: 'utf8', mode: 0o600 });
      printSuccess(`Confirm keys exported to: ${color.cyan(outputFile)}`);
    }
  } catch (error) {
    handleError('Error exporting data:', error);
  }
}

export async function importData(type: string, file: string, options: ImportOptions): Promise<void> {
  debug('importData called', { type, file, options });
  const scope = resolveScope(options);
  try {
    // Validate type parameter
    if (!validateDataType(type)) {
      printError(getInvalidDataTypeMessage(type));
      return;
    }

    // Check if file exists
    if (!fs.existsSync(file)) {
      printError(`Import file not found: ${file}`);
      return;
    }

    // Confirm before overwriting unless --force or --preview is used
    if (!options.force && !options.preview) {
      console.log(color.yellow(`⚠ This will ${options.merge ? 'merge' : 'replace'} your ${type} file.`));
      const confirmed = await confirmOrAbort('Continue? [y/N] ');
      if (!confirmed) return;
    }

    // Parse and validate JSON
    let importedData: unknown;
    try {
      importedData = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      printError('The import file contains invalid JSON.');
      return;
    }

    if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
      printError('The import file must contain a JSON object.');
      return;
    }

    const validData = importedData as Record<string, unknown>;

    // For type=all, the file is shaped { entries: {...}, aliases: {...},
    // confirm: {...} } and each section needs its own validator + handler.
    // For the single-type imports, validData is the section itself.
    //
    // Pre-fix, the CLI ran type=all through three separate top-level
    // branches that all treated `validData` as the section payload — so
    // an --all import file got saved as entries with keys "entries"/
    // "aliases"/"confirm", and the alias branch rejected validData because
    // its values were objects, not strings. The MCP codex_import handler
    // already does the per-section split correctly; this brings the CLI
    // into line.
    const isAll = type === 'all';
    const entriesSection: Record<string, unknown> | undefined =
      type === 'entries' ? validData :
      isAll && validData.entries && typeof validData.entries === 'object' && !Array.isArray(validData.entries)
        ? validData.entries as Record<string, unknown>
        : undefined;
    const aliasesSection: Record<string, unknown> | undefined =
      type === 'aliases' ? validData :
      isAll && validData.aliases && typeof validData.aliases === 'object' && !Array.isArray(validData.aliases)
        ? validData.aliases as Record<string, unknown>
        : undefined;
    const confirmSection: Record<string, unknown> | undefined =
      type === 'confirm' ? validData :
      isAll && validData.confirm && typeof validData.confirm === 'object' && !Array.isArray(validData.confirm)
        ? validData.confirm as Record<string, unknown>
        : undefined;

    if (isAll && !entriesSection && !aliasesSection && !confirmSection) {
      printError('Import with type "all" requires {"entries": {...}, "aliases": {...}, "confirm": {...}} (at least one section).');
      return;
    }

    // Preview mode: show diff without modifying data
    if (options.preview) {
      // Validate raw input the same way the apply path does. Pre-fix the
      // preview silently dropped bad keys via flattenObject's prototype-
      // getter trap, so the user saw a clean preview for an import the
      // apply would reject.
      try {
        if (entriesSection) validateImportEntries(entriesSection);
        if (aliasesSection) {
          const hasNonStringValues = Object.values(aliasesSection).some(v => typeof v !== 'string');
          if (!hasNonStringValues) validateImportAliases(aliasesSection);
        }
        if (confirmSection) validateImportConfirm(confirmSection);
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        return;
      }
      showImportPreview(type, validData, !!options.merge);
      return;
    }

    // Auto-backup before destructive import (replace, not merge). If the
    // backup throws, abort — a destructive import with no rollback point
    // is exactly the failure mode #74 was filed to prevent.
    if (!options.merge) {
      try {
        createAutoBackup('pre-import', scope);
      } catch (err) {
        printError(`Aborting: auto-backup failed (${err instanceof Error ? err.message : String(err)}). No changes were made.`);
        return;
      }
    }

    if (entriesSection) {
      // Validate raw input BEFORE expandFlatKeys runs. expandFlatKeys
      // silently normalizes some bad keys (e.g. ".dotleading" → "dotleading")
      // and erases the evidence that the input was invalid.
      try {
        validateImportEntries(entriesSection);
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        return;
      }
      const expanded = expandFlatKeys(entriesSection);
      const currentData = options.merge ? loadData(scope) : {};

      const newData = options.merge
        ? deepMerge(currentData, expanded)
        : expanded;

      saveData(newData as CodexData, scope);
      printSuccess(`Entries ${options.merge ? 'merged' : 'imported'} successfully`);
    }

    if (aliasesSection) {
      const hasNonStringValues = Object.values(aliasesSection).some(v => typeof v !== 'string');
      if (hasNonStringValues) {
        printError('Alias values must all be strings (dot-notation paths).');
        return;
      }
      try {
        validateImportAliases(aliasesSection);
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        return;
      }

      const currentAliases = options.merge ? loadAliases(scope) : {};

      const newAliases = options.merge
        ? { ...currentAliases, ...(aliasesSection as Record<string, string>) }
        : aliasesSection;

      saveAliases(newAliases as Record<string, string>, scope);
      printSuccess(`Aliases ${options.merge ? 'merged' : 'imported'} successfully`);
    }

    if (confirmSection) {
      try {
        validateImportConfirm(confirmSection);
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        return;
      }
      const currentConfirm = options.merge ? loadConfirmKeys(scope) : {};
      const newConfirm = options.merge
        ? { ...currentConfirm, ...(confirmSection as Record<string, true>) }
        : confirmSection;
      saveConfirmKeys(newConfirm as Record<string, true>, scope);
      printSuccess(`Confirm keys ${options.merge ? 'merged' : 'imported'} successfully`);
    }
  } catch (error) {
    handleError('Error importing data:', error);
  }
}

export async function resetData(type: string, options: ResetOptions): Promise<void> {
  debug('resetData called', { type, options });
  const scope = resolveScope(options);
  try {
    // Validate type parameter
    if (!validateResetType(type)) {
      printError(getInvalidResetTypeMessage(type));
      return;
    }

    // Confirm before resetting unless --force is used
    if (!options.force) {
      console.log(color.yellow(`⚠ This will reset your ${type} to an empty state.`));
      const confirmed = await confirmOrAbort('Continue? [y/N] ');
      if (!confirmed) return;
    }

    // Log-file resets (audit, telemetry, miss-paths) — global only, no backup needed
    if (type === 'audit' || type === 'telemetry' || type === 'miss-paths') {
      const file = type === 'audit' ? getAuditPath() : type === 'telemetry' ? getTelemetryPath() : getMissPathsPath();
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      const label = type === 'audit' ? 'Audit log' : type === 'telemetry' ? 'Telemetry' : 'Miss-path log';
      printSuccess(`${label} has been cleared`);
      return;
    }

    // Auto-backup before reset. Abort if the backup can't be written —
    // see #74.
    try {
      createAutoBackup('pre-reset', scope);
    } catch (err) {
      printError(`Aborting: auto-backup failed (${err instanceof Error ? err.message : String(err)}). No changes were made.`);
      return;
    }

    // Reset entries
    if (type === 'entries' || type === 'all') {
      saveData({}, scope);
      printSuccess('Entries have been reset to an empty state');
    }

    // Reset aliases
    if (type === 'aliases' || type === 'all') {
      saveAliases({}, scope);
      printSuccess('Aliases have been reset to an empty state');
    }

    // Reset confirm keys
    if (type === 'confirm' || type === 'all') {
      saveConfirmKeys({}, scope);
      printSuccess('Confirm keys have been reset to an empty state');
    }
  } catch (error) {
    handleError('Error resetting data:', error);
  }
}

function computeDiff(current: Record<string, string>, incoming: Record<string, string>, merge: boolean): string[] {
  const lines: string[] = [];

  if (merge) {
    const allKeys = new Set([...Object.keys(current), ...Object.keys(incoming)]);
    for (const key of [...allKeys].sort()) {
      const inCurrent = key in current;
      const inImport = key in incoming;
      if (inImport && !inCurrent) {
        lines.push(color.green(`  [add]    ${key}: ${incoming[key]}`));
      } else if (inImport && inCurrent && current[key] !== incoming[key]) {
        lines.push(color.yellow(`  [modify] ${key}: ${current[key]} → ${incoming[key]}`));
      }
      // unchanged keys are omitted for brevity
    }
  } else {
    // Replace mode: everything current is removed, everything incoming is added
    for (const key of Object.keys(current).sort()) {
      if (!(key in incoming) || current[key] !== incoming[key]) {
        lines.push(color.red(`  [remove] ${key}: ${current[key]}`));
      }
    }
    for (const key of Object.keys(incoming).sort()) {
      if (!(key in current) || current[key] !== incoming[key]) {
        lines.push(color.green(`  [add]    ${key}: ${incoming[key]}`));
      }
    }
  }

  return lines;
}

function showImportPreview(type: string, validData: Record<string, unknown>, merge: boolean): void {
  // Mirror the same section dispatch the apply path uses. Pre-fix, this
  // function ran three top-level branches all against `validData`, so an
  // --all import file shaped {entries:..., aliases:..., confirm:...} got
  // diffed as if the wrapper itself were the entries (showing
  // "[add] entries.foo: bar", "[add] aliases.alias: target", etc.).
  const isAll = type === 'all';
  const entriesSection: Record<string, unknown> | undefined =
    type === 'entries' ? validData :
    isAll && validData.entries && typeof validData.entries === 'object' && !Array.isArray(validData.entries)
      ? validData.entries as Record<string, unknown>
      : undefined;
  const aliasesSection: Record<string, unknown> | undefined =
    type === 'aliases' ? validData :
    isAll && validData.aliases && typeof validData.aliases === 'object' && !Array.isArray(validData.aliases)
      ? validData.aliases as Record<string, unknown>
      : undefined;
  const confirmSection: Record<string, unknown> | undefined =
    type === 'confirm' ? validData :
    isAll && validData.confirm && typeof validData.confirm === 'object' && !Array.isArray(validData.confirm)
      ? validData.confirm as Record<string, unknown>
      : undefined;

  let hasChanges = false;

  if (entriesSection) {
    const currentFlat = flattenObject(loadData());
    const importFlat = flattenObject(expandFlatKeys(entriesSection));
    const lines = computeDiff(currentFlat, importFlat, merge);
    console.log(color.bold(`Entries (${merge ? 'merge' : 'replace'}):`));
    if (lines.length > 0) {
      lines.forEach(l => console.log(l));
      hasChanges = true;
    } else {
      console.log(color.gray('  No changes'));
    }
  }

  if (aliasesSection) {
    const currentAliases = loadAliases();
    const currentFlat: Record<string, string> = {};
    const importFlat: Record<string, string> = {};
    for (const [k, v] of Object.entries(currentAliases)) currentFlat[k] = v;
    for (const [k, v] of Object.entries(aliasesSection)) importFlat[k] = String(v);
    const lines = computeDiff(currentFlat, importFlat, merge);
    console.log(color.bold(`Aliases (${merge ? 'merge' : 'replace'}):`));
    if (lines.length > 0) {
      lines.forEach(l => console.log(l));
      hasChanges = true;
    } else {
      console.log(color.gray('  No changes'));
    }
  }

  if (confirmSection) {
    const currentConfirm = loadConfirmKeys();
    const currentFlat: Record<string, string> = {};
    const importFlat: Record<string, string> = {};
    for (const k of Object.keys(currentConfirm)) currentFlat[k] = 'true';
    for (const k of Object.keys(confirmSection)) importFlat[k] = 'true';
    const lines = computeDiff(currentFlat, importFlat, merge);
    console.log(color.bold(`Confirm keys (${merge ? 'merge' : 'replace'}):`));
    if (lines.length > 0) {
      lines.forEach(l => console.log(l));
      hasChanges = true;
    } else {
      console.log(color.gray('  No changes'));
    }
  }

  if (!hasChanges) {
    console.log(color.gray('No changes would be made.'));
  }

  console.log(color.gray('\nThis is a preview. No data was modified.'));
}

const PERSISTENCE_VALUE = '.codexcli/ = project knowledge store (any agent, file-per-entry layout). CLAUDE.md = Claude behavioral directives. MEMORY.md = personal user preferences. Rule: if another agent would benefit, it belongs in .codexcli/.';

export function handleProjectFile(options: {
  remove?: boolean;
  scaffold?: boolean;
  scan?: boolean;
  claude?: boolean;
  force?: boolean;
  dryRun?: boolean;
}): void {
  if (options.remove) {
    const projectPath = findProjectFile();
    if (!projectPath) {
      printError('No .codexcli project store found in current directory tree.');
      return;
    }
    // findProjectFile may return either a legacy .codexcli.json file or a
    // v1.10.0 .codexcli/ directory. rmSync handles both uniformly.
    fs.rmSync(projectPath, { recursive: true, force: true });
    clearProjectFileCache();
    printSuccess(`Removed: ${projectPath}`);
    return;
  }

  const cwd = process.cwd();
  const target = path.join(cwd, '.codexcli');

  // Single stat call to determine the target's state.
  let targetStat: ReturnType<typeof fs.statSync> | null = null;
  try {
    targetStat = fs.statSync(target);
  } catch { /* ENOENT — target doesn't exist yet */ }

  // Check for the edge case where target exists but is not a directory
  // (e.g. a leftover legacy file). mkdirSync would throw EEXIST in that case.
  if (targetStat !== null && !targetStat.isDirectory()) {
    const kind = targetStat.isFile() ? 'file' : targetStat.isSymbolicLink() ? 'symlink' : 'non-directory';
    printError(
      `Cannot initialize: '${target}' already exists as a ${kind}. ` +
      `Remove it manually before running 'ccli init'.`
    );
    return;
  }

  const existed = targetStat !== null;

  // Create .codexcli/ directory with empty sidecars if it doesn't exist
  if (!existed) {
    if (!options.dryRun) {
      fs.mkdirSync(target, { recursive: true, mode: 0o700 });
      // Seed empty sidecars so the store has a consistent initial state
      fs.writeFileSync(path.join(target, '_aliases.json'), '{}\n', { mode: 0o600 });
      fs.writeFileSync(path.join(target, '_confirm.json'), '{}\n', { mode: 0o600 });
      clearProjectFileCache();
    }
    printSuccess(`Created: ${target}`);
  }

  // Scan codebase and populate entries (unless --no-scan)
  const shouldScan = options.scan !== false;
  if (shouldScan) {
    if (options.dryRun) {
      const discovered = scanCodebase(cwd);
      if (discovered.length > 0) {
        console.log(color.bold('Would scaffold:'));
        for (const { key, value } of discovered) {
          console.log(`  ${key}: ${value}`);
        }
      } else {
        printWarning('No project information detected.');
      }
    } else {
      scaffoldProject();
    }
  }

  // Seed conventions.persistence (unless --no-scan or it already exists)
  if (shouldScan && !options.dryRun) {
    const existing = getValue('conventions.persistence', 'project');
    if (existing === undefined) {
      setValue('conventions.persistence', PERSISTENCE_VALUE, 'project');
      console.log(`  ${color.green('+')} conventions.persistence: ${color.white(PERSISTENCE_VALUE)}`);
    }

    // Seed context.initialized marker for agents to detect fresh scaffold
    const initMarker = getValue('context.initialized', 'project');
    if (initMarker === undefined) {
      const markerValue = 'scaffold — arch.* and context.* namespaces need deep analysis by an AI agent';
      setValue('context.initialized', markerValue, 'project');
      console.log(`  ${color.green('+')} context.initialized: ${color.white(markerValue)}`);
    }
  }

  // Generate CLAUDE.md (unless --no-claude)
  if (options.claude !== false) {
    if (options.dryRun) {
      const content = generateClaudeMd({ cwd, dryRun: true });
      if (content) {
        console.log(color.bold('\nWould create CLAUDE.md:'));
        console.log(content);
      }
    } else {
      generateClaudeMd({ cwd, force: options.force });
    }
  }
}

function mergeScaffoldEntries(discovered: ScaffoldEntry[]): number {
  if (discovered.length === 0) {
    printWarning('No project information detected.');
    return 0;
  }

  // Deduplicate by key (first wins — e.g., package.json name over go.mod module)
  const seen = new Set<string>();
  const unique = discovered.filter(e => {
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    return true;
  });

  // Merge into existing project data (skip keys that already exist)
  let count = 0;
  for (const { key, value } of unique) {
    const existing = getValue(key, 'project');
    if (existing !== undefined) continue;
    setValue(key, value, 'project');
    console.log(`  ${color.green('+')} ${key}: ${color.white(value)}`);
    count++;
  }

  if (count === 0) {
    console.log(color.gray('  All discovered entries already exist. Nothing to add.'));
  } else {
    printSuccess(`Scaffolded ${count} entries.`);
  }

  return count;
}

function scaffoldProject(): void {
  const discovered = scanCodebase(process.cwd());
  mergeScaffoldEntries(discovered);
}
