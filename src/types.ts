/**
 * Type definitions for CodexCLI
 */

// General command options
export type CommandOptions = Record<string, any> & { raw?: boolean; tree?: boolean; debug?: boolean };

// Type definitions for specific options
export type FormatOption = 'json' | 'yaml' | 'text';
export type ExportType = 'data' | 'aliases' | 'all';

export interface GetOptions {
  format?: FormatOption;
  tree?: boolean;
  raw?: boolean;
  keysOnly?: boolean;
}

export interface SearchOptions {
  keysOnly?: boolean;
  valuesOnly?: boolean;
  tree?: boolean;
}

export interface ExportOptions {
  format?: string;
  output?: string;
  pretty?: boolean;
}

export interface ImportOptions {
  format?: string;
  merge?: boolean;
  force?: boolean;
}

export interface ResetOptions {
  force?: boolean;
}

/**
 * Data structure supporting nested hierarchical data with dot notation
 * Example: { server: { production: { ip: "192.168.1.100" } } }
 */
export type CodexValue = string | { [key: string]: CodexValue };
export type CodexData = Record<string, CodexValue>;