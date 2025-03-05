import { CodexData } from './types';

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
export function getNestedValue(obj: Record<string, any>, path: string): any {
  if (!path) return obj;
  return path.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);
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
const flattenCache = new Map<string, Record<string, any>>();

export function flattenObject(obj: Record<string, any>, parentKey: string = ''): Record<string, any> {
  // Create a cache key from the object and parent key
  const cacheKey = parentKey + JSON.stringify(obj);
  
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
  
  // Store result in cache (limit cache size)
  if (flattenCache.size > 100) {
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