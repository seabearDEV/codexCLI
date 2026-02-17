import { CodexData, CodexValue } from '../types';

/**
 * Sets a value at a nested path using dot notation (e.g., 'user.settings.theme')
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
 * Gets a value from a nested path using dot notation
 */
export function getNestedValue(obj: CodexData, path: string): CodexValue | undefined {
  if (!path) return undefined;
  const keys = path.split('.');
  let current: CodexValue | undefined = obj[keys[0]];
  for (let i = 1; i < keys.length; i++) {
    if (current === undefined || typeof current === 'string') return undefined;
    current = current[keys[i]];
  }
  return current;
}

/**
 * Removes a value at a nested path and cleans up empty parent objects
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
  const stack: {obj: CodexData, key: string}[] = [];
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
  
  // Clean up empty objects
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
 * Flattens nested objects into a flat map with dot-notation keys
 * Example: { user: { name: "John" } } → { "user.name": "John" }
 */
export function flattenObject(obj: Record<string, unknown>, parentKey: string = ''): Record<string, string> {
  return Object.keys(obj).reduce((acc, key) => {
    const newKey = parentKey ? `${parentKey}.${key}` : key;

    if (typeof obj[key] === 'object' && obj[key] !== null) {
      Object.assign(acc, flattenObject(obj[key] as Record<string, unknown>, newKey));
    } else {
      acc[newKey] = String(obj[key]);
    }

    return acc;
  }, {} as Record<string, string>);
}

