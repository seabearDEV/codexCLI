/**
 * Type definitions for CodexCLI
 */

export interface GetOptions {
  tree?: boolean | undefined;
  raw?: boolean | undefined;
  keysOnly?: boolean | undefined;
  decrypt?: boolean | undefined;
  copy?: boolean | undefined;
}

export interface SearchOptions {
  keysOnly?: boolean | undefined;
  valuesOnly?: boolean | undefined;
  entriesOnly?: boolean | undefined;
  aliasesOnly?: boolean | undefined;
  tree?: boolean | undefined;
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