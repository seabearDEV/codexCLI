import crypto from 'crypto';
import { loadData, handleError, getValue, setValue, removeValue } from '../storage';
import { flattenObject } from '../utils/objectPath';
import { CodexValue } from '../types';
import { displayTree } from '../formatting';
import { color } from '../formatting';
import { execSync } from 'child_process';
import { ensureDataDirectoryExists } from '../utils/paths';
import { buildKeyToAliasMap, setAlias } from '../alias';
import { debug } from '../utils/debug';
import { GetOptions } from '../types';
import { printSuccess, printWarning, printError, displayEntries, askConfirmation, askPassword } from './helpers';
import { copyToClipboard } from '../utils/clipboard';
import { isEncrypted, encryptValue, decryptValue } from '../utils/crypto';

export async function runCommand(key: string, options: { yes?: boolean, dry?: boolean, decrypt?: boolean, source?: boolean }): Promise<void> {
  debug('runCommand called', { key, options });
  try {
    let value = getValue(key);

    if (value === undefined) {
      printError(`Entry '${key}' not found.`);
      process.exitCode = 1;
      return;
    }

    if (typeof value !== 'string') {
      printError(`Entry '${key}' is not a string command (got ${typeof value}).`);
      process.exitCode = 1;
      return;
    }

    if (isEncrypted(value)) {
      if (!options.decrypt) {
        printError(`Entry '${key}' is encrypted. Use --decrypt to decrypt and run.`);
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

export async function setEntry(key: string, value: string, force: boolean = false, encrypt: boolean = false, alias?: string): Promise<void> {
  debug('setEntry called', { key, force, encrypt, alias });
  try {
    ensureDataDirectoryExists();

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

function displayAllEntries(data: Record<string, CodexValue>, aliasMap: Record<string, string[]>, options: GetOptions): void {
  if (Object.keys(data).length === 0) {
    if (options.raw) return;
    console.log('\n' + color.boldColors.magenta('Entries:'));
    console.log(color.gray('  No entries found. Add one with "ccli set <key> <value>"'));
    console.log('');
    return;
  }

  if (options.keysOnly) {
    const flat = flattenObject(data);
    for (const k of Object.keys(flat)) {
      console.log(k);
    }
    return;
  }

  if (options.tree) {
    displayTree(data, aliasMap, '', '', !!options.raw);
    return;
  }

  if (options.raw) {
    const flat = flattenObject(data);
    for (const [k, v] of Object.entries(flat)) {
      console.log(`${k}: ${isEncrypted(String(v)) ? '[encrypted]' : v}`);
    }
    return;
  }

  displayEntries(flattenObject(data), aliasMap);
}

function displaySubtree(key: string, value: Record<string, CodexValue>, aliasMap: Record<string, string[]>, options: GetOptions): void {
  if (options.tree) {
    displayTree({ [key]: value } as Record<string, unknown>, aliasMap, '', '', !!options.raw);
    return;
  }

  if (options.raw) {
    const flat = flattenObject({ [key]: value });
    for (const [k, v] of Object.entries(flat)) {
      console.log(`${k}: ${isEncrypted(String(v)) ? '[encrypted]' : v}`);
    }
    return;
  }

  const filteredEntries = flattenObject({ [key]: value });

  if (Object.keys(filteredEntries).length === 0) {
    console.log(`No entries found under '${key}'.`);
    return;
  }

  displayEntries(filteredEntries, aliasMap);
}

export async function getEntry(key?: string, options: GetOptions = {}): Promise<void> {
  debug('getEntry called', { key, options });

  const aliasMap = buildKeyToAliasMap();

  if (!key) {
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
    displaySubtree(key, value, aliasMap, options);
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
    if (options.copy) {
      try {
        copyToClipboard(decrypted);
        printSuccess('Copied to clipboard.');
        return;
      } catch (err) {
        printError(`Failed to copy: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (options.raw) {
      console.log(decrypted);
    } else {
      displayEntries({ [key]: decrypted }, aliasMap);
    }
    return;
  }

  if (options.copy) {
    const copyValue = isEncrypted(strValue) ? '[encrypted]' : strValue;
    try {
      copyToClipboard(copyValue);
      printSuccess('Copied to clipboard.');
      return;
    } catch (err) {
      printError(`Failed to copy: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (options.raw) {
    console.log(isEncrypted(strValue) ? '[encrypted]' : value);
    return;
  }

  displayEntries({ [key]: strValue }, aliasMap);
}

export function removeEntry(key: string): void {
  debug('removeEntry called', { key });
  const removed = removeValue(key);

  if (!removed) {
    printWarning(`Entry '${key}' not found.`);
    return;
  }

  printSuccess(`Entry '${key}' removed successfully.`);
}
