import { resolveKey } from '../alias';
import { getValue } from '../storage';
import { flattenObject } from './objectPath';
import { isEncrypted } from './crypto';
import { CodexValue } from '../types';

const INTERPOLATION_REGEX = /\$\{([^}]+)\}/g;
const MAX_DEPTH = 10;

/**
 * Interpolate `${key_or_alias}` references within a string value.
 * References are resolved at read time via the data store and alias map.
 * Supports recursive resolution with circular reference detection.
 */
export function interpolate(value: string, maxDepth: number = MAX_DEPTH, seen: Set<string> = new Set()): string {
  if (!value.includes('${')) return value;

  return value.replace(INTERPOLATION_REGEX, (_match, ref: string) => {
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

    // Recurse to resolve nested references
    const nextSeen = new Set(seen);
    nextSeen.add(resolvedKey);
    return interpolate(resolved, maxDepth - 1, nextSeen);
  });
}

/**
 * Interpolate all leaf string values in a nested object (subtree).
 * Returns a new object with interpolated values.
 */
export function interpolateObject(obj: Record<string, CodexValue>): Record<string, CodexValue> {
  const flat = flattenObject(obj);
  const result: Record<string, CodexValue> = {};

  for (const [key, value] of Object.entries(flat)) {
    if (typeof value === 'string' && !isEncrypted(value)) {
      try {
        result[key] = interpolate(value);
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
