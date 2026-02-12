import fs from 'fs';
import { color } from './formatting';
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
 */
export function saveData(data: Record<string, any>): void {
  const filePath = getDataFilePath();
  
  handleOperation(() => {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }, `Failed to save data to ${filePath}`);
}

