import crypto from 'crypto';
import { loadData, handleError, getValue, setValue, removeValue } from '../storage';
import { flattenObject } from '../utils/objectPath';
import { CodexValue } from '../types';
import { displayTree } from '../formatting';
import { color } from '../formatting';
import { execSync } from 'child_process';
import { ensureDataDirectoryExists } from '../utils/paths';
import { buildKeyToAliasMap, setAlias, removeAliasesForKey, loadAliases, resolveKey, renameAlias, removeAlias } from '../alias';
import { hasConfirm, setConfirm, removeConfirm, removeConfirmForKey } from '../confirm';
import { debug } from '../utils/debug';
import { GetOptions } from '../types';
import { printSuccess, printWarning, printError, displayEntries, displayAliases, askConfirmation, askPassword } from './helpers';
import { copyToClipboard } from '../utils/clipboard';
import { isEncrypted, encryptValue, decryptValue } from '../utils/crypto';
import { interpolate, interpolateObject } from '../utils/interpolate';
import { getBinaryName } from '../utils/binaryName';

export async function runCommand(keys: string[], options: { yes?: boolean, dry?: boolean, decrypt?: boolean, source?: boolean }): Promise<void> {
  debug('runCommand called', { keys, options });
  try {
    const commands: string[] = [];
    const resolvedKeys: string[] = [];

    for (const keyGroup of keys) {
      // Split on : for composition (e.g. "cd:codexcli" → "cd /path")
      const segments = keyGroup.replace(/:$/, '').split(':');
      const resolvedSegments: string[] = [];

      for (const segment of segments) {
        const resolvedKey = resolveKey(segment);
        resolvedKeys.push(resolvedKey);
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

    const value = commands.join(' && ');

    if (options.source) {
      process.stderr.write(color.gray('$ ') + color.white(value) + '\n');
    } else {
      console.log(color.gray('$ ') + color.white(value));
    }

    if (options.dry) {
      return;
    }

    // Only prompt if any resolved key has confirm metadata set (and --yes not passed)
    const needsConfirm = resolvedKeys.some(k => hasConfirm(k));
    if (needsConfirm && !options.yes && process.stdin.isTTY) {
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
        execSync(value, { stdio: 'inherit', shell: process.env.SHELL ?? '/bin/sh' });
      } catch (err: unknown) {
        process.exitCode = (err && typeof err === 'object' && 'status' in err ? Number(err.status) : 1) || 1;
      }
    }
  } catch (error) {
    handleError('Failed to run command:', error);
  }
}

async function promptAndEncrypt(value: string): Promise<string | null> {
  const password = await askPassword('Password: ');
  const confirmPw = await askPassword('Confirm password: ');
  const passwordBuf = Buffer.from(password);
  const confirmBuf = Buffer.from(confirmPw);
  if (passwordBuf.length !== confirmBuf.length || !crypto.timingSafeEqual(passwordBuf, confirmBuf)) {
    printError('Passwords do not match.');
    process.exitCode = 1;
    return null;
  }
  return encryptValue(value, password);
}

async function handlePostSetConfirm(key: string, confirm: boolean | undefined): Promise<void> {
  if (confirm === true) {
    setConfirm(key);
  } else if (confirm === false) {
    removeConfirm(key);
  } else if (process.stdin.isTTY) {
    const answer = await askConfirmation('Require confirmation to run? [y/N] ');
    if (answer.toLowerCase() === 'y') {
      setConfirm(key);
    }
  }
}

export async function setEntry(key: string, value: string | undefined, force = false, encrypt = false, alias?: string, confirm?: boolean): Promise<void> {
  debug('setEntry called', { key, force, encrypt, alias, confirm });
  try {
    ensureDataDirectoryExists();

    // Confirm-only or alias-only update: no value provided
    if (value === undefined) {
      // Handle --confirm / --no-confirm on an existing entry (no value needed)
      if (confirm !== undefined) {
        const existing = getValue(key);
        if (existing === undefined) {
          printError(`Entry '${key}' not found. Cannot update confirm on a non-existent entry.`);
          process.exitCode = 1;
          return;
        }
        if (confirm) {
          setConfirm(key);
          printSuccess(`Entry '${key}' now requires confirmation to run.`);
        } else {
          removeConfirm(key);
          printSuccess(`Entry '${key}' no longer requires confirmation to run.`);
        }
        if (alias) {
          setAlias(alias, key);
        }
        return;
      }
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
      const encrypted = await promptAndEncrypt(value);
      if (encrypted === null) return;
      storedValue = encrypted;
    }

    setValue(key, storedValue);
    console.log(`Entry '${key}' set successfully.`);

    if (alias) {
      setAlias(alias, key);
    }

    await handlePostSetConfirm(key, confirm);
  } catch (error) {
    handleError('Failed to set entry:', error);
  }
}

function displayFlatEntries(flat: Record<string, string>, aliasMap: Record<string, string>, options: GetOptions): void {
  const entries = options.source
    ? flat as Record<string, CodexValue>
    : interpolateObject(flat as Record<string, CodexValue>);

  if (options.raw) {
    for (const [k, v] of Object.entries(entries)) {
      const strVal = typeof v === 'string' ? v : JSON.stringify(v);
      console.log(`${k}: ${isEncrypted(strVal) ? '[encrypted]' : strVal}`);
    }
    return;
  }

  displayEntries(entries as Record<string, string>, aliasMap);
}

function displayAllEntries(data: Record<string, CodexValue>, aliasMap: Record<string, string>, options: GetOptions): void {
  if (Object.keys(data).length === 0) {
    if (options.raw) return;
    console.log(color.gray(`No entries found. Add one with "${getBinaryName()} set <key> <value>"`));
    console.log('');
    return;
  }

  if (options.tree) {
    displayTree(data, aliasMap, '', '', !!options.raw, undefined, !!options.source);
    return;
  }

  displayFlatEntries(flattenObject(data), aliasMap, options);
}

function displaySubtree(key: string, value: Record<string, CodexValue>, aliasMap: Record<string, string>, options: GetOptions): void {
  if (options.tree) {
    displayTree({ [key]: value } as Record<string, unknown>, aliasMap, '', '', !!options.raw, undefined, !!options.source);
    return;
  }

  const flat = flattenObject({ [key]: value });

  if (Object.keys(flat).length === 0) {
    console.log(`No entries found under '${key}'.`);
    return;
  }

  displayFlatEntries(flat, aliasMap, options);
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
        printError(`Failed to copy: ${err instanceof Error ? err.message : String(err)}`);
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
      printError(`Failed to copy: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (options.raw) {
    console.log(isEncrypted(strValue) ? '[encrypted]' : displayValue);
    return;
  }

  displayEntries({ [key]: displayValue }, aliasMap);
}

export async function removeEntry(key: string, force = false): Promise<void> {
  debug('removeEntry called', { key, force });

  const existing = getValue(key);
  if (existing === undefined) {
    printWarning(`Entry '${key}' not found.`);
    return;
  }

  if (!force && process.stdin.isTTY) {
    const answer = await askConfirmation(`Remove '${key}'? [y/N] `);
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      return;
    }
  }

  removeValue(key);

  // Cascade delete: remove any aliases pointing to this key or its children
  removeAliasesForKey(key);

  // Cascade delete: remove confirm metadata for this key or its children
  removeConfirmForKey(key);

  printSuccess(`Entry '${key}' removed successfully.`);
}

export function renameEntry(oldKey: string, newKey: string, aliasMode = false, newAlias?: string): void {
  debug('renameEntry called', { oldKey, newKey, aliasMode, newAlias });

  if (aliasMode) {
    const result = renameAlias(oldKey, newKey);
    if (!result) {
      const aliases = loadAliases();
      if (!(oldKey in aliases)) {
        printError(`Alias '${oldKey}' not found.`);
      } else {
        printError(`Alias '${newKey}' already exists.`);
      }
      process.exitCode = 1;
      return;
    }
    printSuccess(`Alias '${oldKey}' renamed to '${newKey}'.`);
    return;
  }

  // Entry key rename
  const value = getValue(oldKey);
  if (value === undefined) {
    printError(`Entry '${oldKey}' not found.`);
    process.exitCode = 1;
    return;
  }

  const existing = getValue(newKey);
  if (existing !== undefined) {
    printError(`Entry '${newKey}' already exists. Remove it first or choose a different key.`);
    process.exitCode = 1;
    return;
  }

  // Move the value
  if (typeof value === 'string') {
    setValue(newKey, value);
  } else {
    // For subtrees, flatten and re-set each leaf under the new prefix
    const flat = flattenObject({ [oldKey]: value });
    for (const [flatKey, flatVal] of Object.entries(flat)) {
      const suffix = flatKey.slice(oldKey.length);
      setValue(newKey + suffix, String(flatVal));
    }
  }
  removeValue(oldKey);

  // Update aliases: re-point any alias targeting oldKey (or children) to newKey
  const aliases = loadAliases();
  const oldPrefix = oldKey + '.';
  for (const [alias, target] of Object.entries(aliases)) {
    if (typeof target !== 'string') continue;
    if (target === oldKey) {
      removeAlias(alias);
      setAlias(alias, newKey);
    } else if (target.startsWith(oldPrefix)) {
      const newTarget = newKey + target.slice(oldKey.length);
      removeAlias(alias);
      setAlias(alias, newTarget);
    }
  }

  // Move confirm metadata
  if (hasConfirm(oldKey)) {
    removeConfirm(oldKey);
    setConfirm(newKey);
  }

  // Set a new alias on the renamed key
  if (newAlias) {
    setAlias(newAlias, newKey);
  }

  printSuccess(`Entry '${oldKey}' renamed to '${newKey}'.`);
}
