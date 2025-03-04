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
 * Standard error handler
 */
export function handleError(message: string, error: any): void {
  if (process.env.DEBUG) {
    console.error(`${color.red(message)}: `, error);
  } else {
    console.error(color.red(message));
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