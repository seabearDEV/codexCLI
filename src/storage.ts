/**
 * Data storage management module for CodexCLI
 * 
 * This module handles all data persistence operations, including reading from
 * and writing to the JSON storage file. It provides error handling and ensures
 * that the storage directory exists before attempting file operations.
 */
import * as fs from 'fs';
import { getDataFilePath } from './utils/paths';
import { CodexData } from './types';
import chalk from 'chalk';

/**
 * Path to the JSON data file
 * Retrieved from utility function to ensure consistent location across the application
 */
const DATA_FILE = getDataFilePath();

// Note: Directory creation and data file initialization is handled by utils/paths

/**
 * Load data from JSON file
 * 
 * @returns {object} The parsed JSON data
 */
export function loadData(): any {
  try {
    const dataPath = getDataFilePath();
    
    // If file doesn't exist, return empty object without creating file
    if (!fs.existsSync(dataPath)) {
      return {};
    }
    
    const data = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    handleError('Error loading data:', error);
    return {};
  }
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
export function saveData(data: CodexData): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    handleError('Error writing data file:', error);
  }
}

/**
 * Standardized error handling
 */
export function handleError(message: string, error?: unknown): void {
  console.error(chalk.red('ERROR: ') + message);
  if (error) {
    console.error(chalk.red('Details: ') + (error instanceof Error ? error.message : String(error)));
  }
  process.exit(1);
}