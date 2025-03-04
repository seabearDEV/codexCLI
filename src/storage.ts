/**
 * Data storage management module for CodexCLI
 * 
 * This module handles all data persistence operations, including reading from
 * and writing to the JSON storage file. It provides error handling and ensures
 * that the storage directory exists before attempting file operations.
 */
import fs from 'fs';
import { color } from './formatting';
// Import the path utility instead of defining a duplicate function
import { getDataFilePath } from './utils/paths';

/**
 * Handle operation with consistent error handling
 */
export function handleOperation<T>(operation: () => T, errorMessage: string): T | null {
  try {
    return operation();
  } catch (error) {
    handleError(errorMessage, error);
    return null;
  }
}

/**
 * Handle operation with consistent error handling and default value
 */
export function safeOperation<T>(operation: () => T, 
                               errorMessage: string, 
                               defaultValue: T): T {
  try {
    return operation();
  } catch (error) {
    handleError(errorMessage, error);
    return defaultValue;
  }
}

/**
 * Consistent error handling with improved context
 */
export function handleError(message: string, error: any, context?: string): void {
  const contextPrefix = context ? `[${context}] ` : '';
  
  if (process.env.DEBUG) {
    console.error(`${color.red(contextPrefix + message)}: `, error);
    if (error instanceof Error && error.stack) {
      console.error(color.gray(error.stack));
    }
  } else {
    console.error(color.red(contextPrefix + message));
  }
}

/**
 * Load data from storage
 * 
 * @returns {object} The parsed JSON data
 */
export function loadData(): Record<string, any> {
  const filePath = getDataFilePath();
  
  if (!fs.existsSync(filePath)) {
    return {};
  }
  
  return handleOperation(() => {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }, `Failed to load data from ${filePath}`) || {};
}

/**
 * Save data to storage
 * 
 * Serializes the data object to JSON and writes it to the data file.
 * Uses pretty formatting with 2-space indentation for human readability.
 * 
 * @param {CodexData} data - The data object to save
 * @throws Will call handleError if file writing fails
 */
export function saveData(data: Record<string, any>): void {
  const filePath = getDataFilePath();
  
  handleOperation(() => {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }, `Failed to save data to ${filePath}`);
}

/**
 * Perform an operation with the loaded data and save the data afterwards
 * 
 * @param {function} operation - The operation to perform with the data
 * @returns {any} The result of the operation
 */
export function withData<T>(operation: (data: Record<string, any>) => T): T {
  const data = loadData();
  const result = operation(data);
  saveData(data);
  return result;
}