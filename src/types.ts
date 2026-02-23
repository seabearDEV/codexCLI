/**
 * Type definitions for CodexCLI
 */

export interface GetOptions {
  tree?: boolean | undefined;
  raw?: boolean | undefined;
  source?: boolean | undefined;
  decrypt?: boolean | undefined;
  copy?: boolean | undefined;
  aliases?: boolean | undefined;
  json?: boolean | undefined;
}

export interface SearchOptions {
  entries?: boolean | undefined;
  aliases?: boolean | undefined;
  tree?: boolean | undefined;
  json?: boolean | undefined;
}

export interface ExportOptions {
  output?: string;
  pretty?: boolean;
}

export interface ImportOptions {
  merge?: boolean;
  force?: boolean;
  preview?: boolean;
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