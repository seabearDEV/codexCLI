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
  return path.split('.').reduce((o, p) => o?.[p], obj);
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
export function flattenObject(obj: Record<string, any>, parentKey: string = ''): Record<string, any> {
  return Object.keys(obj).reduce((acc, key) => {
    const newKey = parentKey ? `${parentKey}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      Object.assign(acc, flattenObject(obj[key], newKey));
    } else {
      acc[newKey] = obj[key];
    }
    
    return acc;
  }, {} as Record<string, any>);
}