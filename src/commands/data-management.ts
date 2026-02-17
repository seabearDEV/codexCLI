import { loadData, saveData, handleError } from '../storage';
import { color } from '../formatting';
import fs from 'fs';
import { loadAliases, saveAliases } from '../alias';
import { CodexData, ExportOptions, ImportOptions, ResetOptions } from '../types';
import path from 'path';
import { validateDataType, confirmOrAbort, getInvalidDataTypeMessage, printSuccess, printError } from './helpers';
import { deepMerge } from '../utils/deepMerge';
import { maskEncryptedValues } from '../utils/crypto';

export function exportData(type: string, options: ExportOptions): void {
  try {
    if (!validateDataType(type)) {
      printError(getInvalidDataTypeMessage(type));
      return;
    }

    const defaultDir = process.cwd();
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const indent = options.pretty ? 2 : 0;

    if (type === 'data' || type === 'all') {
      const outputFile = options.output || path.join(defaultDir, `codexcli-data-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(maskEncryptedValues(loadData()), null, indent), 'utf8');
      printSuccess(`Data exported to: ${color.cyan(outputFile)}`);
    }

    if (type === 'aliases' || type === 'all') {
      const outputFile = options.output || path.join(defaultDir, `codexcli-aliases-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(loadAliases(), null, indent), 'utf8');
      printSuccess(`Aliases exported to: ${color.cyan(outputFile)}`);
    }
  } catch (error) {
    handleError('Error exporting data:', error);
  }
}

export async function importData(type: string, file: string, options: ImportOptions): Promise<void> {
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

    // Confirm before overwriting unless --force is used
    if (!options.force) {
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

    if (type === 'data' || type === 'all') {
      const currentData = options.merge ? loadData() : {};

      const newData = options.merge
        ? deepMerge(currentData, validData)
        : validData;

      saveData(newData as CodexData);
      printSuccess(`Data ${options.merge ? 'merged' : 'imported'} successfully`);
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
  } catch (error) {
    handleError('Error importing data:', error);
  }
}

export async function resetData(type: string, options: ResetOptions): Promise<void> {
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

    // Reset data
    if (type === 'data' || type === 'all') {
      saveData({});
      printSuccess('Data has been reset to an empty state');
    }

    // Reset aliases
    if (type === 'aliases' || type === 'all') {
      saveAliases({});
      printSuccess('Aliases have been reset to an empty state');
    }
  } catch (error) {
    handleError('Error resetting data:', error);
  }
}
