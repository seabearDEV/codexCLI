import crypto from 'crypto';
import { loadData, handleError, getValue, setValue, removeValue } from '../storage';
import { flattenObject } from '../utils/objectPath';
import { CodexValue } from '../types';
import { displayTree } from '../formatting';
import { color } from '../formatting';
import { execSync } from 'child_process';
import { ensureDataDirectoryExists } from '../utils/paths';
import { buildKeyToAliasMap, setAlias, removeAliasesForKey, loadAliases, resolveKey } from '../alias';
import { debug } from '../utils/debug';
import { GetOptions } from '../types';
import { printSuccess, printWarning, printError, displayEntries, displayAliases, askConfirmation, askPassword } from './helpers';
import { copyToClipboard } from '../utils/clipboard';
import { isEncrypted, encryptValue, decryptValue } from '../utils/crypto';
import { interpolate, interpolateObject } from '../utils/interpolate';

export async function runCommand(keys: string[], options: { yes?: boolean, dry?: boolean, decrypt?: boolean, source?: boolean }): Promise<void> {
  debug('runCommand called', { keys, options });
  try {
    const commands: string[] = [];

    for (const keyGroup of keys) {
      // Split on : for composition (e.g. "cd:codexcli" → "cd /path")
      const segments = keyGroup.replace(/:$/, '').split(':');
      const resolvedSegments: string[] = [];

      for (const segment of segments) {
        const resolvedKey = resolveKey(segment);
        let value = getValue(resolvedKey);

        if (value === undefined) {
          printError(`Entry '${segment}' not found.`);
          process.exitCode = 1;
          return;
        }

        if (typeof value !== 'string') {
          printError(`Entry '${segment}' is not a string command (got ${typeof value}).`);
          process.exitCode = 1;
          return;
        }

        if (isEncrypted(value)) {
          if (!options.decrypt) {
            printError(`Entry '${segment}' is encrypted. Use --decrypt to decrypt and run.`);
            process.exitCode = 1;
            return;
          }
          const password = await askPassword('Password: ');
          try {
            value = decryptValue(value, password);
          } catch {
            printError('Decryption failed. Wrong password or corrupted data.');
            process.exitCode = 1;
            return;
          }
        }

        try {
          value = interpolate(value);
        } catch (err) {
          printError(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
          return;
        }

        resolvedSegments.push(value);
      }

      commands.push(resolvedSegments.join(' '));
    }

    let value = commands.join(' && ');

    if (options.source) {
      process.stderr.write(color.gray('$ ') + color.white(value) + '\n');
    } else {
      console.log(color.gray('$ ') + color.white(value));
    }

    if (options.dry) {
      return;
    }

    if (!options.yes && process.stdin.isTTY) {
      const answer = await askConfirmation('Run this? [y/N] ', options.source ? process.stderr : undefined);
      if (answer.toLowerCase() !== 'y') {
        if (options.source) {
          process.stderr.write('Aborted.\n');
        } else {
          console.log('Aborted.');
        }
        return;
      }
    }

    if (options.source) {
      process.stdout.write(value + '\n');
    } else {
      try {
        execSync(value, { stdio: 'inherit', shell: process.env.SHELL || '/bin/sh' });
      } catch (err: unknown) {
        process.exitCode = (err && typeof err === 'object' && 'status' in err ? Number(err.status) : 1) || 1;
      }
    }
  } catch (error) {
    handleError('Failed to run command:', error);
  }
}

export async function setEntry(key: string, value: string | undefined, force: boolean = false, encrypt: boolean = false, alias?: string): Promise<void> {
  debug('setEntry called', { key, force, encrypt, alias });
  try {
    ensureDataDirectoryExists();

    // Alias-only update: no value provided, just update the alias on an existing entry
    if (value === undefined) {
      if (!alias) {
        printError('Missing value. Provide a value or use --alias (-a) to update an alias.');
        process.exitCode = 1;
        return;
      }
      const existing = getValue(key);
      if (existing === undefined) {
        printError(`Entry '${key}' not found. Cannot set alias on a non-existent entry.`);
        process.exitCode = 1;
        return;
      }
      setAlias(alias, key);
      return;
    }

    const existing = getValue(key);
    if (existing !== undefined && !force && process.stdin.isTTY) {
      const displayVal = typeof existing === 'object'
        ? JSON.stringify(existing)
        : isEncrypted(String(existing)) ? '[encrypted]' : String(existing);
      console.log(`Key '${key}' already exists with value: ${displayVal}`);
      const answer = await askConfirmation('Overwrite? [y/N] ');
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.');
        return;
      }
    }

    let storedValue = value;
    if (encrypt) {
      const password = await askPassword('Password: ');
      const confirm = await askPassword('Confirm password: ');
      const passwordBuf = Buffer.from(password);
      const confirmBuf = Buffer.from(confirm);
      if (passwordBuf.length !== confirmBuf.length || !crypto.timingSafeEqual(passwordBuf, confirmBuf)) {
        printError('Passwords do not match.');
        process.exitCode = 1;
        return;
      }
      storedValue = encryptValue(value, password);
    }

    setValue(key, storedValue);
    printSuccess(`Entry '${key}' set successfully.`);

    if (alias) {
      setAlias(alias, key);
    }
  } catch (error) {
    handleError('Failed to set entry:', error);
  }
}

function displayAllEntries(data: Record<string, CodexValue>, aliasMap: Record<string, string>, options: GetOptions): void {
  if (Object.keys(data).length === 0) {
    if (options.raw) return;
    console.log(color.gray('No entries found. Add one with "ccli set <key> <value>"'));
    console.log('');
    return;
  }

  if (options.tree) {
    displayTree(data, aliasMap, '', '', !!options.raw);
    return;
  }

  const flat = flattenObject(data);
  const interpolated = interpolateObject(flat as Record<string, CodexValue>);

  if (options.raw) {
    for (const [k, v] of Object.entries(interpolated)) {
      console.log(`${k}: ${isEncrypted(String(v)) ? '[encrypted]' : v}`);
    }
    return;
  }

  displayEntries(interpolated as Record<string, string>, aliasMap);
}

function displaySubtree(key: string, value: Record<string, CodexValue>, aliasMap: Record<string, string>, options: GetOptions): void {
  if (options.tree) {
    displayTree({ [key]: value } as Record<string, unknown>, aliasMap, '', '', !!options.raw);
    return;
  }

  const filteredEntries = flattenObject({ [key]: value });

  if (Object.keys(filteredEntries).length === 0) {
    console.log(`No entries found under '${key}'.`);
    return;
  }

  const interpolated = interpolateObject(filteredEntries as Record<string, CodexValue>);

  if (options.raw) {
    for (const [k, v] of Object.entries(interpolated)) {
      console.log(`${k}: ${isEncrypted(String(v)) ? '[encrypted]' : v}`);
    }
    return;
  }

  displayEntries(interpolated as Record<string, string>, aliasMap);
}

export async function getEntry(key?: string, options: GetOptions = {}): Promise<void> {
  debug('getEntry called', { key, options });

  const aliasMap = buildKeyToAliasMap();

  if (!key) {
    // -a → aliases only
    if (options.aliases) {
      const aliases = loadAliases();
      displayAliases(aliases);
      return;
    }

    const data = loadData();
    displayAllEntries(data, aliasMap, options);
    return;
  }

  const value = getValue(key);

  if (value === undefined) {
    console.error(`Entry '${key}' not found`);
    return;
  }

  if (typeof value === 'object' && value !== null) {
    if (options.copy) {
      printWarning('--copy only works with a single value, not a subtree.');
    }
    if (!options.raw && !options.source) {
      try {
        const interpolated = interpolateObject({ [key]: value });
        displaySubtree(key, interpolated as Record<string, CodexValue>, aliasMap, options);
      } catch {
        displaySubtree(key, value, aliasMap, options);
      }
    } else {
      displaySubtree(key, value, aliasMap, options);
    }
    return;
  }

  const strValue = String(value);

  if (isEncrypted(strValue) && options.decrypt) {
    const password = await askPassword('Password: ');
    let decrypted: string;
    try {
      decrypted = decryptValue(strValue, password);
    } catch {
      printError('Decryption failed. Wrong password or corrupted data.');
      process.exitCode = 1;
      return;
    }
    let decryptedDisplay = decrypted;
    try {
      decryptedDisplay = interpolate(decrypted);
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      return;
    }
    if (options.copy) {
      try {
        copyToClipboard(decryptedDisplay);
        printSuccess('Copied to clipboard.');
        return;
      } catch (err) {
        printError(`Failed to copy: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (options.raw) {
      console.log(decryptedDisplay);
    } else {
      displayEntries({ [key]: decryptedDisplay }, aliasMap);
    }
    return;
  }

  // Interpolate unless encrypted or --source
  let displayValue = strValue;
  if (!isEncrypted(strValue) && !options.source) {
    try {
      displayValue = interpolate(strValue);
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      return;
    }
  }

  if (options.copy) {
    const copyValue = isEncrypted(strValue) ? '[encrypted]' : displayValue;
    try {
      copyToClipboard(copyValue);
      printSuccess('Copied to clipboard.');
      return;
    } catch (err) {
      printError(`Failed to copy: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (options.raw) {
    console.log(isEncrypted(strValue) ? '[encrypted]' : displayValue);
    return;
  }

  displayEntries({ [key]: displayValue }, aliasMap);
}

export function removeEntry(key: string): void {
  debug('removeEntry called', { key });
  const removed = removeValue(key);

  if (!removed) {
    printWarning(`Entry '${key}' not found.`);
    return;
  }

  // Cascade delete: remove any aliases pointing to this key or its children
  removeAliasesForKey(key);

  printSuccess(`Entry '${key}' removed successfully.`);
}
