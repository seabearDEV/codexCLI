/**
 * Utility functions for CodexCLI
 * 
 * This module provides helper functions for manipulating nested data structures,
 * accessing and modifying values using dot notation paths, and flattening
 * hierarchical data for display purposes.
 */
import { CodexData } from './types';

/**
 * Sets a value at a nested path
 * 
 * Accepts a dot-notation path (e.g., 'user.settings.theme') and creates
 * the necessary object hierarchy if it doesn't already exist.
 * 
 * @param {CodexData} obj - The target object to modify
 * @param {string} path - Dot-notation path where value should be set
 * @param {string} value - Value to set at the specified path
 */
export function setNestedValue(obj: CodexData, path: string, value: string): void {
  const keys = path.split('.');
  let current = obj;
  
  // Navigate to the innermost object
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as CodexData;
  }
  
  // Set the value at the innermost level
  current[keys[keys.length - 1]] = value;
}

/**
 * Gets a value from a nested path
 * 
 * Retrieves a value using dot notation path, returning undefined
 * if any segment of the path doesn't exist.
 * 
 * @param {CodexData} obj - The source object to retrieve from
 * @param {string} path - Dot-notation path to the desired value
 * @returns {string | undefined} The value if found, undefined otherwise
 */
export function getNestedValue(obj: Record<string, any>, path: string): any {
  if (!path) return obj;
  return path.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);
}

/**
 * Removes a value at a nested path
 * 
 * Deletes the target property and optionally cleans up empty parent objects.
 * Returns a boolean indicating success or failure.
 * 
 * @param {CodexData} obj - The object to modify
 * @param {string} path - Dot-notation path of the value to remove
 * @returns {boolean} True if removal succeeded, false if path doesn't exist
 */
export function removeNestedValue(obj: CodexData, path: string): boolean {
  const keys = path.split('.');
  
  if (keys.length === 1) {
    // Simple case - top-level key
    if (obj[keys[0]] === undefined) return false;
    delete obj[keys[0]];
    return true;
  }
  
  // For nested paths
  const stack: {obj: any, key: string}[] = [];
  let current = obj;
  
  // Navigate to the parent of the target
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      return false; // Path doesn't exist
    }
    stack.push({ obj: current, key });
    current = current[key] as CodexData;
  }
  
  // Delete the value
  const lastKey = keys[keys.length - 1];
  if (current[lastKey] === undefined) {
    return false; // Key doesn't exist
  }
  
  delete current[lastKey];
  
  // Clean up empty objects (optional)
  for (let i = stack.length - 1; i >= 0; i--) {
    const { obj, key } = stack[i];
    if (Object.keys(obj[key]).length === 0) {
      delete obj[key];
    } else {
      break; // Stop if object is not empty
    }
  }
  
  return true;
}

/**
 * Flattens nested objects for display
 * 
 * Converts a hierarchical object structure into a flat key-value map,
 * where nested keys are represented using dot notation.
 * Uses memoization to improve performance for repeated calls.
 * 
 * Example:
 *   Input: { user: { name: "John", email: "john@example.com" } }
 *   Output: { "user.name": "John", "user.email": "john@example.com" }
 * 
 * @param {CodexData} obj - The hierarchical object to flatten
 * @param {string} prefix - Optional prefix for nested keys (used for recursion)
 * @returns {Record<string, string>} Flattened key-value pairs
 */
// Memoize flattenObject for repeated calls on same data
const flattenCache = new Map<string, Record<string, any>>();

export function flattenObject(obj: Record<string, any>, parentKey: string = ''): Record<string, any> {
  // Create a cache key from the object and parent key
  const cacheKey = parentKey + JSON.stringify(obj);
  
  // Check if result is already in cache
  if (flattenCache.has(cacheKey)) {
    return flattenCache.get(cacheKey)!;
  }
  
  const result = Object.keys(obj).reduce((acc, key) => {
    const newKey = parentKey ? `${parentKey}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      Object.assign(acc, flattenObject(obj[key], newKey));
    } else {
      acc[newKey] = obj[key];
    }
    
    return acc;
  }, {} as Record<string, any>);
  
  // Store result in cache (limit cache size to prevent memory issues)
  if (flattenCache.size > 100) {
    // Remove oldest entry - fix the potential undefined issue
    const firstKeyIterator = flattenCache.keys().next();
    if (!firstKeyIterator.done && firstKeyIterator.value !== undefined) {
      flattenCache.delete(firstKeyIterator.value);
    }
  }
  flattenCache.set(cacheKey, result);
  
  return result;
}

/**
 * Sets a value in a nested object using a dot-notation path
 * 
 * @param obj The object to modify
 * @param path Dot-notation path to the value
 * @param value The value to set
 */
export function nestedSetValue(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    current[key] = current[key] || {};
    current = current[key];
  }
  
  current[parts[parts.length - 1]] = value;
}