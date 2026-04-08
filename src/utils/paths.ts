import path from 'path';
import os from 'os';
import * as fs from 'fs';
import { getBinaryName } from './binaryName';

/**
 * Determines if the application is running in development mode
 */
function isDev(): boolean {
  return process.env.NODE_ENV === 'development' ||
         getBinaryName() === 'cclid' ||
         Boolean(process.argv[1]?.includes('ts-node')) ||
         Boolean(process.env.npm_lifecycle_script?.includes('ts-node'));
}

// Add caching for path resolution
let dataDirectoryCache: string | null = null;

/**
 * Get the directory where data files should be stored
 */
export function getDataDirectory(): string {
  dataDirectoryCache ??= process.env.CODEX_DATA_DIR
    ?? (isDev()
      ? path.join(path.resolve(__dirname, '..', '..'), 'data')
      : path.join(os.homedir(), '.codexcli'));
  return dataDirectoryCache;
}

/**
 * Ensures data directory exists
 * Creates it if it doesn't exist
 * 
 * @returns {string} Path to the data directory
 */
let dataDirEnsured = false;

export function ensureDataDirectoryExists(): string {
  const dataDir = getDataDirectory();

  if (!dataDirEnsured) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    }
    dataDirEnsured = true;
  }

  return dataDir;
}

/**
 * Get the path to the aliases file
 *
 * @returns {string} Path to the aliases.json file
 */
export function getAliasFilePath(): string {
  return path.join(getDataDirectory(), 'aliases.json');
}

/**
 * Gets the full path to the configuration file
 * 
 * @returns {string} Absolute path to the JSON config file
 */
export function getConfigFilePath(): string {
  return path.join(getDataDirectory(), 'config.json');
}

/**
 * Get the path to the confirm metadata file
 *
 * @returns {string} Path to the confirm.json file
 */
export function getConfirmFilePath(): string {
  return path.join(getDataDirectory(), 'confirm.json');
}

/**
 * Get the path to the unified data file (data.json)
 */
export function getUnifiedDataFilePath(): string {
  return path.join(getDataDirectory(), 'data.json');
}

// Cached project file path (null = not searched yet, string = found, '' = not found)
let projectFileCache: string | null = null;

// Programmatic override for the directory where the search begins.
// Set by the MCP server after capturing client roots.
let projectRootOverride: string | null = null;

/**
 * Set the directory used as the starting point for project file discovery,
 * overriding process.cwd(). Pass null to clear. Clears the cached result.
 */
export function setProjectRootOverride(dir: string | null): void {
  projectRootOverride = dir;
  projectFileCache = null;
}

/**
 * Walk up from cwd to find a .codexcli.json project file.
 * Returns the absolute path if found, null otherwise.
 *
 * Resolution order:
 *   1. CODEX_NO_PROJECT env var → disabled (returns null)
 *   2. CODEX_PROJECT env var → explicit path to a .codexcli.json file or its directory
 *   3. setProjectRootOverride() value (e.g. MCP client roots) → walk up from there
 *   4. process.cwd() → walk up from there
 */
export function findProjectFile(): string | null {
  if (projectFileCache !== null) {
    return projectFileCache === '' ? null : projectFileCache;
  }

  // Allow tests to suppress project file discovery entirely
  if (process.env.CODEX_NO_PROJECT) {
    projectFileCache = '';
    return null;
  }

  // Explicit env var override — file path or containing directory
  const envPath = process.env.CODEX_PROJECT;
  if (envPath) {
    const resolved = path.resolve(envPath);
    let candidate = resolved;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        candidate = path.join(resolved, '.codexcli.json');
      }
    } catch {
      // fall through; existsSync below will handle it
    }
    if (fs.existsSync(candidate)) {
      projectFileCache = candidate;
      return candidate;
    }
    // Env var was set but didn't resolve — treat as "no project" rather than
    // silently falling back to a different directory the user didn't ask for.
    projectFileCache = '';
    return null;
  }

  const globalDir = getDataDirectory();
  let dir = projectRootOverride ?? process.cwd();
  const root = path.parse(dir).root;

  while (true) {
    // Don't match files inside the global data directory
    if (path.resolve(dir) === path.resolve(globalDir)) {
      projectFileCache = '';
      return null;
    }

    const candidate = path.join(dir, '.codexcli.json');
    if (fs.existsSync(candidate)) {
      projectFileCache = candidate;
      return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir || dir === root) {
      projectFileCache = '';
      return null;
    }
    dir = parent;
  }
}

/**
 * Clear the cached project file path (for tests and after create/remove)
 */
export function clearProjectFileCache(): void {
  projectFileCache = null;
  projectStoreDirCache = null;
}

// ── v1.10.0 directory store paths ─────────────────────────────────────
// These are added ahead of the file-per-entry rollout (issue #54) so the
// migration function has somewhere to write. They do not replace the legacy
// file getters yet — the transition happens in the store.ts integration
// commit, after which the legacy getters are kept only for migration.

/**
 * Get the path to the global file-per-entry store directory (v1.10.0 layout).
 * Sits alongside the legacy `data.json` inside `getDataDirectory()` so the
 * existing sibling files (`config.json`, `audit.jsonl`, `telemetry.jsonl`,
 * `miss-paths.jsonl`, `.backups/`) stay where they are.
 */
export function getGlobalStoreDirPath(): string {
  return path.join(getDataDirectory(), 'store');
}

// Cached project store directory path (null = not searched yet, '' = not found)
let projectStoreDirCache: string | null = null;

/**
 * Walk up from cwd (or the programmatic override) to find a `.codexcli/`
 * directory, which is the v1.10.0 project store. Returns the absolute path
 * if found, null otherwise.
 *
 * Resolution order mirrors `findProjectFile()`:
 *   1. CODEX_NO_PROJECT env var → disabled
 *   2. CODEX_PROJECT env var → explicit path, fails closed if missing
 *   3. setProjectRootOverride() value (MCP client roots, launcher hints)
 *   4. process.cwd() walk-up
 *
 * Unlike `findProjectFile()`, this function *only* matches a directory
 * named `.codexcli` — it will not fall back to the legacy `.codexcli.json`
 * file. Callers that need to handle both old and new formats should check
 * `findProjectStoreDir()` first and fall back to `findProjectFile()`.
 */
export function findProjectStoreDir(): string | null {
  if (projectStoreDirCache !== null) {
    return projectStoreDirCache === '' ? null : projectStoreDirCache;
  }

  if (process.env.CODEX_NO_PROJECT) {
    projectStoreDirCache = '';
    return null;
  }

  // Explicit env var override — path to a `.codexcli` directory or its parent.
  const envPath = process.env.CODEX_PROJECT;
  if (envPath) {
    const resolved = path.resolve(envPath);
    let candidate = resolved;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        // If the resolved path IS `.codexcli`, use it directly; otherwise
        // look for `.codexcli` inside it.
        if (path.basename(resolved) !== '.codexcli') {
          candidate = path.join(resolved, '.codexcli');
        }
      }
    } catch {
      // fall through; isDirectory check below will handle it
    }
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      projectStoreDirCache = candidate;
      return candidate;
    }
    // CODEX_PROJECT set but didn't resolve to a directory — fail closed,
    // matching findProjectFile()'s behavior.
    projectStoreDirCache = '';
    return null;
  }

  const globalDir = getDataDirectory();
  let dir = projectRootOverride ?? process.cwd();
  const root = path.parse(dir).root;

  while (true) {
    // Don't match anything inside the global data directory.
    if (path.resolve(dir) === path.resolve(globalDir)) {
      projectStoreDirCache = '';
      return null;
    }

    const candidate = path.join(dir, '.codexcli');
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        projectStoreDirCache = candidate;
        return candidate;
      }
    } catch {
      // stat failed — ignore and keep walking
    }

    const parent = path.dirname(dir);
    if (parent === dir || dir === root) {
      projectStoreDirCache = '';
      return null;
    }
    dir = parent;
  }
}