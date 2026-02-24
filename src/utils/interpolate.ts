import { execSync } from 'child_process';
import { resolveKey } from '../alias';
import { getValue } from '../storage';
import { flattenObject } from './objectPath';
import { isEncrypted } from './crypto';
import { CodexValue } from '../types';

const INTERPOLATION_REGEX = /\$\{([^}]+)\}/g;
const EXEC_INTERPOLATION_REGEX = /\$\(([^)]+)\)/g;
const MAX_DEPTH = 10;

/**
 * Resolve a `${key}` reference: look up stored value, validate, and recurse.
 */
function resolveRef(ref: string, maxDepth: number, seen: Set<string>, execCache: Map<string, string>): string {
  const resolvedKey = resolveKey(ref.trim());

  if (seen.has(resolvedKey)) {
    const chain = [...seen, resolvedKey].join(' → ');
    throw new Error(`Circular interpolation detected: ${chain}`);
  }

  const resolved = getValue(resolvedKey);

  if (resolved === undefined) {
    throw new Error(`Interpolation failed: "${ref}" not found`);
  }

  if (typeof resolved !== 'string') {
    throw new Error(`Interpolation failed: "${ref}" is not a string value`);
  }

  if (isEncrypted(resolved)) {
    throw new Error(`Interpolation failed: "${ref}" is encrypted`);
  }

  if (maxDepth <= 0) {
    throw new Error(`Interpolation depth limit exceeded`);
  }

  const nextSeen = new Set(seen);
  nextSeen.add(resolvedKey);
  return interpolate(resolved, maxDepth - 1, nextSeen, execCache);
}

/**
 * Resolve a `$(key)` exec reference: look up stored command, interpolate it,
 * execute via shell, and return trimmed stdout. Results are cached per pass.
 */
function resolveExecRef(ref: string, maxDepth: number, seen: Set<string>, execCache: Map<string, string>): string {
  const resolvedKey = resolveKey(ref.trim());

  if (seen.has(resolvedKey)) {
    const chain = [...seen, resolvedKey].join(' → ');
    throw new Error(`Circular interpolation detected: ${chain}`);
  }

  // Return cached result if already executed in this pass
  if (execCache.has(resolvedKey)) {
    return execCache.get(resolvedKey)!;
  }

  const resolved = getValue(resolvedKey);

  if (resolved === undefined) {
    throw new Error(`Exec interpolation failed: "${ref}" not found`);
  }

  if (typeof resolved !== 'string') {
    throw new Error(`Exec interpolation failed: "${ref}" is not a string value`);
  }

  if (isEncrypted(resolved)) {
    throw new Error(`Exec interpolation failed: "${ref}" is encrypted`);
  }

  if (maxDepth <= 0) {
    throw new Error(`Interpolation depth limit exceeded`);
  }

  // Interpolate the command itself first (so stored commands can use ${} or $())
  const nextSeen = new Set(seen);
  nextSeen.add(resolvedKey);
  const command = interpolate(resolved, maxDepth - 1, nextSeen, execCache);

  // Execute
  const shell = process.env.SHELL ?? '/bin/sh';
  try {
    const stdout = execSync(command, { encoding: 'utf-8', shell, timeout: 10000 });
    // Trim trailing newline (shell commands typically append one)
    const result = stdout.replace(/\n$/, '');
    execCache.set(resolvedKey, result);
    return result;
  } catch (err: unknown) {
    const code = (err && typeof err === 'object' && 'status' in err) ? Number((err as { status: number }).status) : 1;
    throw new Error(`Exec interpolation failed: "${ref}" exited with code ${code}`);
  }
}

/**
 * Interpolate `${key_or_alias}` and `$(key_or_alias)` references within a string value.
 *
 * - `${key}` resolves to the stored value of a key (recursive).
 * - `$(key)` executes the stored command and substitutes its stdout.
 *
 * References are resolved at read time via the data store and alias map.
 * Supports recursive resolution with circular reference detection.
 */
export function interpolate(
  value: string,
  maxDepth: number = MAX_DEPTH,
  seen = new Set<string>(),
  execCache = new Map<string, string>(),
): string {
  // Early return if no interpolation markers present
  if (!value.includes('${') && !value.includes('$(')) return value;

  // Phase 1: resolve ${key} references
  let result = value;
  if (result.includes('${')) {
    result = result.replace(INTERPOLATION_REGEX, (_match, ref: string) => {
      return resolveRef(ref, maxDepth, seen, execCache);
    });
  }

  // Phase 2: resolve $(key) exec references
  if (result.includes('$(')) {
    result = result.replace(EXEC_INTERPOLATION_REGEX, (_match, ref: string) => {
      return resolveExecRef(ref, maxDepth, seen, execCache);
    });
  }

  return result;
}

/**
 * Interpolate all leaf string values in a nested object (subtree).
 * Returns a new object with interpolated values.
 * Shares a single execCache across all leaves so exec results are cached.
 */
export function interpolateObject(obj: Record<string, CodexValue>): Record<string, CodexValue> {
  const flat = flattenObject(obj);
  const result: Record<string, CodexValue> = {};
  const execCache = new Map<string, string>();

  for (const [key, value] of Object.entries(flat)) {
    if (typeof value === 'string' && !isEncrypted(value)) {
      try {
        result[key] = interpolate(value, MAX_DEPTH, new Set<string>(), execCache);
      } catch {
        // If interpolation fails on a subtree leaf, keep the raw value
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}
