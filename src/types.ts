/**
 * Type definitions for CodexCLI
 * 
 * This module defines TypeScript interfaces and types used throughout 
 * the application to ensure type safety and provide better code documentation.
 */

/**
 * Command options interface
 * 
 * Defines the structure for options that can be passed to command handlers.
 * Includes specific known options with proper typing, while allowing
 * for additional arbitrary options through the index signature.
 * 
 * @property {boolean} [raw] - When true, outputs data without formatting
 * @property {any} [key: string] - Additional arbitrary options
 */
export interface CommandOptions {
  raw?: boolean;
  [key: string]: any;
}

/**
 * Data structure for CodexCLI storage
 * 
 * Recursive type definition that allows for nested hierarchical data.
 * This enables the dot notation access pattern used throughout the application.
 * For example: server.production.ip can be represented as:
 * { server: { production: { ip: "192.168.1.100" } } }
 * 
 * @property {string | CodexData} [key: string] - Either terminal string values or nested objects
 */
export interface CodexData {
  [key: string]: string | CodexData;
}