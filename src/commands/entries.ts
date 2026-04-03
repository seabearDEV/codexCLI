import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadData, handleError, getValue, setValue, removeValue, Scope, getEntriesFlat } from '../storage';
import { flattenObject } from '../utils/objectPath';
import { findProjectFile } from '../store';
import { CodexValue } from '../types';
import { displayTree } from '../formatting';
import { color } from '../formatting';
import { execSync, spawnSync } from 'child_process';
import { ensureDataDirectoryExists } from '../utils/paths';
import { buildKeyToAliasMap, setAlias, removeAliasesForKey, loadAliases, resolveKey, renameAlias, removeAlias } from '../alias';
import { hasConfirm, setConfirm, removeConfirm, removeConfirmForKey } from '../confirm';
import { debug } from '../utils/debug';
import { GetOptions } from '../types';
import { printSuccess, printWarning, printError, displayEntries, displayKeys, displayAliases, askConfirmation, askPassword } from './helpers';
import { copyToClipboard } from '../utils/clipboard';
import { isEncrypted, encryptValue, decryptValue } from '../utils/crypto';
import { interpolate, interpolateObject } from '../utils/interpolate';
import { getBinaryName } from '../utils/binaryName';

function toScope(global?: boolean | undefined): Scope | undefined {
  return global ? 'global' : undefined;
}

export async function runCommand(keys: string[], options: { yes?: boolean, dry?: boolean, decrypt?: boolean, source?: boolean, capture?: boolean, global?: boolean }): Promise<void> {
  debug('runCommand called', { keys, options });
  const scope = toScope(options.global);
  try {
    const commands: string[] = [];
    const resolvedKeys: string[] = [];

    for (const keyGroup of keys) {
      // Split on : for composition (e.g. "cd:codexcli" → "cd /path")
      const segments = keyGroup.replace(/:$/, '').split(':');
      const resolvedSegments: string[] = [];

      for (const segment of segments) {
        const resolvedKey = resolveKey(segment, scope);
        resolvedKeys.push(resolvedKey);
        let value = getValue(resolvedKey, scope);

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
    } else if (options.capture) {
      try {
        const stdout = execSync(value, { encoding: 'utf-8', shell: process.env.SHELL ?? '/bin/sh' });
        process.stdout.write(stdout);
      } catch (err: unknown) {
        process.exitCode = (err && typeof err === 'object' && 'status' in err ? Number(err.status) : 1) || 1;
        if (err && typeof err === 'object' && 'stderr' in err && (err as { stderr?: string }).stderr) {
          process.stderr.write(String((err as { stderr?: string }).stderr));
        }
      }
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

async function handlePostSetConfirm(key: string, confirm: boolean | undefined, scope?: Scope | undefined): Promise<void> {
  if (confirm === true) {
    setConfirm(key, scope);
  } else if (confirm === false) {
    removeConfirm(key, scope);
  } else if (process.stdin.isTTY) {
    const answer = await askConfirmation('Require confirmation to run? [y/N] ');
    if (answer.toLowerCase() === 'y') {
      setConfirm(key, scope);
    }
  }
}

export async function setEntry(key: string, value: string | undefined, force = false, encrypt = false, alias?: string, confirm?: boolean, global?: boolean): Promise<void> {
  debug('setEntry called', { key, force, encrypt, alias, confirm, global });
  const scope = toScope(global);
  try {
    ensureDataDirectoryExists();

    // Confirm-only or alias-only update: no value provided
    if (value === undefined) {
      // Handle --confirm / --no-confirm on an existing entry (no value needed)
      if (confirm !== undefined) {
        const existing = getValue(key, scope);
        if (existing === undefined) {
          printError(`Entry '${key}' not found. Cannot update confirm on a non-existent entry.`);
          process.exitCode = 1;
          return;
        }
        if (confirm) {
          setConfirm(key, scope);
          printSuccess(`Entry '${key}' now requires confirmation to run.`);
        } else {
          removeConfirm(key, scope);
          printSuccess(`Entry '${key}' no longer requires confirmation to run.`);
        }
        if (alias) {
          setAlias(alias, key, scope);
        }
        return;
      }
      if (!alias) {
        printError('Missing value. Provide a value or use --alias (-a) to update an alias.');
        process.exitCode = 1;
        return;
      }
      const existing = getValue(key, scope);
      if (existing === undefined) {
        printError(`Entry '${key}' not found. Cannot set alias on a non-existent entry.`);
        process.exitCode = 1;
        return;
      }
      setAlias(alias, key, scope);
      return;
    }

    const existing = getValue(key, scope);
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

    setValue(key, storedValue, scope);
    console.log(`Entry '${key}' set successfully.`);

    if (alias) {
      setAlias(alias, key, scope);
    }

    await handlePostSetConfirm(key, confirm, scope);
  } catch (error) {
    handleError('Failed to set entry:', error);
  }
}

function displayFlatEntries(flat: Record<string, string>, aliasMap: Record<string, string>, options: GetOptions, projectKeys?: Set<string>): void {
  // Keys-only mode: no key specified and --values not set
  if (!options.values) {
    if (options.raw) {
      for (const k of Object.keys(flat)) {
        console.log(k);
      }
      return;
    }
    displayKeys(Object.keys(flat), aliasMap, projectKeys);
    return;
  }

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

  displayEntries(entries as Record<string, string>, aliasMap, projectKeys);
}

function displayAllEntries(data: Record<string, CodexValue>, aliasMap: Record<string, string>, options: GetOptions, projectKeys?: Set<string>): void {
  if (Object.keys(data).length === 0) {
    if (options.raw) return;
    console.log(color.gray(`No entries found. Add one with "${getBinaryName()} set <key> <value>"`));
    console.log('');
    return;
  }

  if (options.tree) {
    displayTree(data, aliasMap, '', '', !!options.raw, undefined, !!options.source, !options.values, options.depth);
    return;
  }

  displayFlatEntries(flattenObject(data, '', options.depth), aliasMap, options, projectKeys);
}

function displaySubtree(key: string, value: Record<string, CodexValue>, aliasMap: Record<string, string>, options: GetOptions, projectKeys?: Set<string>): void {
  if (options.tree) {
    displayTree({ [key]: value } as Record<string, unknown>, aliasMap, '', '', !!options.raw, undefined, !!options.source, !options.values, options.depth);
    return;
  }

  const flat = flattenObject({ [key]: value }, '', options.depth);

  if (Object.keys(flat).length === 0) {
    console.log(`No entries found under '${key}'.`);
    return;
  }

  displayFlatEntries(flat, aliasMap, options, projectKeys);
}

export async function getEntry(key?: string, options: GetOptions = {}): Promise<void> {
  debug('getEntry called', { key, options });
  const scope = toScope(options.global);

  const aliasMap = buildKeyToAliasMap();

  // --json output mode
  if (options.json) {
    if (!key) {
      if (options.aliases) {
        console.log(JSON.stringify(loadAliases(scope), null, 2));
      } else {
        const data = loadData(scope);
        const flat = flattenObject(data);
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(flat)) {
          if (isEncrypted(v)) {
            result[k] = '[encrypted]';
          } else {
            try { result[k] = interpolate(v); } catch { result[k] = v; }
          }
        }
        console.log(JSON.stringify(result, null, 2));
      }
      return;
    }

    const val = getValue(key, scope);
    if (val === undefined) {
      console.error(JSON.stringify({ error: `Entry '${key}' not found` }));
      process.exitCode = 1;
      return;
    }
    if (typeof val === 'object' && val !== null) {
      const flat = flattenObject({ [key]: val });
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(flat)) {
        if (isEncrypted(v)) {
          result[k] = '[encrypted]';
        } else {
          try { result[k] = interpolate(v); } catch { result[k] = v; }
        }
      }
      console.log(JSON.stringify(result, null, 2));
    } else {
      const strVal = String(val);
      let displayVal: string;
      if (isEncrypted(strVal)) {
        displayVal = '[encrypted]';
      } else {
        try { displayVal = interpolate(strVal); } catch { displayVal = strVal; }
      }
      console.log(JSON.stringify({ [key]: displayVal }));
    }
    return;
  }

  if (!key) {
    // -a → aliases only
    if (options.aliases) {
      const aliases = loadAliases(scope);
      displayAliases(aliases);
      return;
    }

    const data = loadData(scope);
    // Compute project keys for [P] marker when showing merged results
    let projectKeys: Set<string> | undefined;
    if (!scope && findProjectFile()) {
      projectKeys = new Set(Object.keys(getEntriesFlat('project')));
    }
    displayAllEntries(data, aliasMap, options, projectKeys);
    return;
  }

  const value = getValue(key, scope);

  if (value === undefined) {
    console.error(`Entry '${key}' not found`);
    return;
  }

  if (typeof value === 'object' && value !== null) {
    if (options.copy) {
      printWarning('--copy only works with a single value, not a subtree.');
    }
    let projectKeys: Set<string> | undefined;
    if (!scope && findProjectFile()) {
      projectKeys = new Set(Object.keys(getEntriesFlat('project')));
    }
    displaySubtree(key, value, aliasMap, options, projectKeys);
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

export async function editEntry(key: string, options: { decrypt?: boolean, global?: boolean } = {}): Promise<void> {
  debug('editEntry called', { key, options });
  const scope = toScope(options.global);
  try {
    const editor = process.env.VISUAL ?? process.env.EDITOR;
    if (!editor) {
      printError('No editor configured. Set $EDITOR or $VISUAL environment variable.');
      process.exitCode = 1;
      return;
    }

    let value = getValue(key, scope);

    if (value === undefined) {
      printError(`Entry '${key}' not found.`);
      process.exitCode = 1;
      return;
    }

    if (typeof value !== 'string') {
      printError(`Entry '${key}' is a subtree, not a single value. Cannot edit.`);
      process.exitCode = 1;
      return;
    }

    let password: string | undefined;
    if (isEncrypted(value)) {
      if (!options.decrypt) {
        printError(`Entry '${key}' is encrypted. Use --decrypt to edit.`);
        process.exitCode = 1;
        return;
      }
      password = await askPassword('Password: ');
      try {
        value = decryptValue(value, password);
      } catch {
        printError('Decryption failed. Wrong password or corrupted data.');
        process.exitCode = 1;
        return;
      }
    }

    const tmpFile = path.join(os.tmpdir(), `codexcli-edit-${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, value, { encoding: 'utf8', mode: 0o600 });

    try {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd' : (process.env.SHELL ?? '/bin/sh');
      const shellArgs = isWindows
        ? ['/c', `${editor} "%CODEX_TMPFILE%"`]
        : ['-c', `${editor} "$CODEX_TMPFILE"`];
      const result = spawnSync(shell, shellArgs, {
        stdio: 'inherit',
        env: { ...process.env, CODEX_TMPFILE: tmpFile },
      });
      if (result.error) throw result.error;
      if (result.status !== 0 && result.status !== null) {
        throw new Error(`Editor exited with code ${result.status}`);
      }
      const newValue = fs.readFileSync(tmpFile, 'utf8');

      if (newValue === value) {
        console.log('No changes made.');
        return;
      }

      let storedValue = newValue;
      if (password) {
        storedValue = encryptValue(newValue, password);
      }

      setValue(key, storedValue, scope);
      printSuccess(`Entry '${key}' updated successfully.`);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
    }
  } catch (error) {
    handleError('Failed to edit entry:', error);
  }
}

export async function removeEntry(key: string, force = false, global?: boolean): Promise<void> {
  debug('removeEntry called', { key, force, global });
  const scope = toScope(global);

  const existing = getValue(key, scope);
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

  removeValue(key, scope);

  // Cascade delete: remove any aliases pointing to this key or its children
  removeAliasesForKey(key, scope);

  // Cascade delete: remove confirm metadata for this key or its children
  removeConfirmForKey(key, scope);

  printSuccess(`Entry '${key}' removed successfully.`);
}

export async function copyEntry(sourceKey: string, destKey: string, force = false, global?: boolean): Promise<void> {
  debug('copyEntry called', { sourceKey, destKey, force, global });
  const scope = toScope(global);
  try {
    const value = getValue(sourceKey, scope);
    if (value === undefined) {
      printError(`Entry '${sourceKey}' not found.`);
      process.exitCode = 1;
      return;
    }

    const existing = getValue(destKey, scope);
    if (existing !== undefined && !force && process.stdin.isTTY) {
      const displayVal = typeof existing === 'object'
        ? JSON.stringify(existing)
        : isEncrypted(String(existing)) ? '[encrypted]' : String(existing);
      console.log(`Key '${destKey}' already exists with value: ${displayVal}`);
      const answer = await askConfirmation('Overwrite? [y/N] ');
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.');
        return;
      }
    }

    if (typeof value === 'string') {
      setValue(destKey, value, scope);
    } else {
      const flat = flattenObject({ [sourceKey]: value });
      for (const [flatKey, flatVal] of Object.entries(flat)) {
        const suffix = flatKey.slice(sourceKey.length);
        setValue(destKey + suffix, String(flatVal), scope);
      }
    }

    printSuccess(`Entry '${sourceKey}' copied to '${destKey}'.`);
  } catch (error) {
    handleError('Failed to copy entry:', error);
  }
}

export function renameEntry(oldKey: string, newKey: string, aliasMode = false, newAlias?: string, global?: boolean): void {
  debug('renameEntry called', { oldKey, newKey, aliasMode, newAlias, global });
  const scope = toScope(global);

  if (aliasMode) {
    const result = renameAlias(oldKey, newKey, scope);
    if (!result) {
      const aliases = loadAliases(scope);
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
  const value = getValue(oldKey, scope);
  if (value === undefined) {
    printError(`Entry '${oldKey}' not found.`);
    process.exitCode = 1;
    return;
  }

  const existing = getValue(newKey, scope);
  if (existing !== undefined) {
    printError(`Entry '${newKey}' already exists. Remove it first or choose a different key.`);
    process.exitCode = 1;
    return;
  }

  // Move the value
  if (typeof value === 'string') {
    setValue(newKey, value, scope);
  } else {
    // For subtrees, flatten and re-set each leaf under the new prefix
    const flat = flattenObject({ [oldKey]: value });
    for (const [flatKey, flatVal] of Object.entries(flat)) {
      const suffix = flatKey.slice(oldKey.length);
      setValue(newKey + suffix, String(flatVal), scope);
    }
  }
  removeValue(oldKey, scope);

  // Update aliases: re-point any alias targeting oldKey (or children) to newKey
  const aliases = loadAliases(scope);
  const oldPrefix = oldKey + '.';
  for (const [alias, target] of Object.entries(aliases)) {
    if (typeof target !== 'string') continue;
    if (target === oldKey) {
      removeAlias(alias, scope);
      setAlias(alias, newKey, scope);
    } else if (target.startsWith(oldPrefix)) {
      const newTarget = newKey + target.slice(oldKey.length);
      removeAlias(alias, scope);
      setAlias(alias, newTarget, scope);
    }
  }

  // Move confirm metadata
  if (hasConfirm(oldKey)) {
    removeConfirm(oldKey, scope);
    setConfirm(newKey, scope);
  }

  // Set a new alias on the renamed key
  if (newAlias) {
    setAlias(newAlias, newKey, scope);
  }

  printSuccess(`Entry '${oldKey}' renamed to '${newKey}'.`);
}
