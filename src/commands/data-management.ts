import { loadData, saveData, handleError } from '../storage';
import { color } from '../formatting';
import fs from 'fs';
import { loadAliases, saveAliases } from '../alias';
import { loadConfirmKeys, saveConfirmKeys } from '../confirm';
import { CodexData, ExportOptions, ImportOptions, ResetOptions } from '../types';
import path from 'path';
import { validateDataType, confirmOrAbort, getInvalidDataTypeMessage, printSuccess, printError } from './helpers';
import { deepMerge } from '../utils/deepMerge';
import { flattenObject } from '../utils/objectPath';
import { maskEncryptedValues } from '../utils/crypto';
import { debug } from '../utils/debug';
import { createAutoBackup } from '../utils/autoBackup';

export function exportData(type: string, options: ExportOptions): void {
  debug('exportData called', { type, options });
  try {
    if (!validateDataType(type)) {
      printError(getInvalidDataTypeMessage(type));
      return;
    }

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
      fs.writeFileSync(outputFile, JSON.stringify(maskEncryptedValues(loadData()), null, indent), { encoding: 'utf8', mode: 0o600 });
      printSuccess(`Entries exported to: ${color.cyan(outputFile)}`);
    }

    if (type === 'aliases' || type === 'all') {
      const outputFile = getOutputFile('aliases', `codexcli-aliases-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(loadAliases(), null, indent), { encoding: 'utf8', mode: 0o600 });
      printSuccess(`Aliases exported to: ${color.cyan(outputFile)}`);
    }

    if (type === 'confirm' || type === 'all') {
      const outputFile = getOutputFile('confirm', `codexcli-confirm-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(loadConfirmKeys(), null, indent), { encoding: 'utf8', mode: 0o600 });
      printSuccess(`Confirm keys exported to: ${color.cyan(outputFile)}`);
    }
  } catch (error) {
    handleError('Error exporting data:', error);
  }
}

export async function importData(type: string, file: string, options: ImportOptions): Promise<void> {
  debug('importData called', { type, file, options });
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

    // Preview mode: show diff without modifying data
    if (options.preview) {
      showImportPreview(type, validData, !!options.merge);
      return;
    }

    // Auto-backup before destructive import (replace, not merge)
    if (!options.merge) {
      createAutoBackup('pre-import');
    }

    if (type === 'entries' || type === 'all') {
      const currentData = options.merge ? loadData() : {};

      const newData = options.merge
        ? deepMerge(currentData, validData)
        : validData;

      saveData(newData as CodexData);
      printSuccess(`Entries ${options.merge ? 'merged' : 'imported'} successfully`);
    }

    if (type === 'aliases' || type === 'all') {
      const hasNonStringValues = Object.values(validData).some(v => typeof v !== 'string');
      if (hasNonStringValues) {
        printError('Alias values must all be strings (dot-notation paths).');
        return;
      }

      const currentAliases = options.merge ? loadAliases() : {};

      const newAliases = options.merge
        ? { ...currentAliases, ...(validData as Record<string, string>) }
        : validData;

      saveAliases(newAliases as Record<string, string>);
      printSuccess(`Aliases ${options.merge ? 'merged' : 'imported'} successfully`);
    }

    if (type === 'confirm' || type === 'all') {
      const currentConfirm = options.merge ? loadConfirmKeys() : {};
      const newConfirm = options.merge
        ? { ...currentConfirm, ...(validData as Record<string, true>) }
        : validData;
      saveConfirmKeys(newConfirm as Record<string, true>);
      printSuccess(`Confirm keys ${options.merge ? 'merged' : 'imported'} successfully`);
    }
  } catch (error) {
    handleError('Error importing data:', error);
  }
}

export async function resetData(type: string, options: ResetOptions): Promise<void> {
  debug('resetData called', { type, options });
  try {
    // Validate type parameter
    if (!validateDataType(type)) {
      printError(getInvalidDataTypeMessage(type));
      return;
    }

    // Confirm before resetting unless --force is used
    if (!options.force) {
      console.log(color.yellow(`⚠ This will reset your ${type} to an empty state.`));
      const confirmed = await confirmOrAbort('Continue? [y/N] ');
      if (!confirmed) return;
    }

    // Auto-backup before reset
    createAutoBackup('pre-reset');

    // Reset entries
    if (type === 'entries' || type === 'all') {
      saveData({});
      printSuccess('Entries have been reset to an empty state');
    }

    // Reset aliases
    if (type === 'aliases' || type === 'all') {
      saveAliases({});
      printSuccess('Aliases have been reset to an empty state');
    }

    // Reset confirm keys
    if (type === 'confirm' || type === 'all') {
      saveConfirmKeys({});
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
  let hasChanges = false;

  if (type === 'entries' || type === 'all') {
    const currentFlat = flattenObject(loadData());
    const importFlat = flattenObject(validData);
    const lines = computeDiff(currentFlat, importFlat, merge);
    console.log(color.bold(`Entries (${merge ? 'merge' : 'replace'}):`));
    if (lines.length > 0) {
      lines.forEach(l => console.log(l));
      hasChanges = true;
    } else {
      console.log(color.gray('  No changes'));
    }
  }

  if (type === 'aliases' || type === 'all') {
    const currentAliases = loadAliases();
    const importAliases = validData as Record<string, string>;
    const currentFlat: Record<string, string> = {};
    const importFlat: Record<string, string> = {};
    for (const [k, v] of Object.entries(currentAliases)) currentFlat[k] = v;
    for (const [k, v] of Object.entries(importAliases)) importFlat[k] = String(v);
    const lines = computeDiff(currentFlat, importFlat, merge);
    console.log(color.bold(`Aliases (${merge ? 'merge' : 'replace'}):`));
    if (lines.length > 0) {
      lines.forEach(l => console.log(l));
      hasChanges = true;
    } else {
      console.log(color.gray('  No changes'));
    }
  }

  if (type === 'confirm' || type === 'all') {
    const currentConfirm = loadConfirmKeys();
    const importConfirm = validData;
    const currentFlat: Record<string, string> = {};
    const importFlat: Record<string, string> = {};
    for (const k of Object.keys(currentConfirm)) currentFlat[k] = 'true';
    for (const k of Object.keys(importConfirm)) importFlat[k] = 'true';
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
