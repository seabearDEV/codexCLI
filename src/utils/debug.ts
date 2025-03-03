/**
 * Debug utilities for CodexCLI
 * 
 * This module provides functionality for conditional debug logging
 * that only activates when the DEBUG environment variable is set to 'true'.
 * Uses gray coloring to visually distinguish debug output from normal application output.
 */
import chalk from 'chalk';

/**
 * Conditionally log debug information
 * 
 * Outputs debug messages and optional data to the console when debug mode is enabled.
 * Debug output is styled in gray to distinguish it from regular application output.
 * Data objects are automatically stringified with proper indentation.
 * 
 * @param {string} message - The debug message to display
 * @param {any} [data] - Optional data to serialize and display as JSON
 */
export function debug(message: string, data?: any): void {
  if (process.env.DEBUG === 'true') {
    console.log(chalk.gray(`[DEBUG] ${message}`));
    if (data) console.log(chalk.gray(JSON.stringify(data, null, 2)));
  }
}