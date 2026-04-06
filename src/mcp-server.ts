#!/usr/bin/env node
/* eslint-disable @typescript-eslint/require-await */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { loadData, saveData, getValue, setValue, removeValue, getEntriesFlat, Scope } from "./storage";
import { CodexData } from "./types";
import {
  flattenObject,
  setNestedValue,
} from "./utils/objectPath";
import {
  loadAliases,
  saveAliases,
  setAlias,
  removeAlias,
  resolveKey,
  buildKeyToAliasMap,
  removeAliasesForKey,
  renameAlias,
} from "./alias";
import {
  ensureDataDirectoryExists,
} from "./utils/paths";
import { findProjectFile, loadEntries, saveEntriesAndTouchMeta } from "./store";
import { hasConfirm, setConfirm, removeConfirm, loadConfirmKeys, saveConfirmKeys, removeConfirmForKey } from "./confirm";
import { loadConfig, getConfigSetting, setConfigSetting, VALID_CONFIG_KEYS } from "./config";
import { deepMerge } from "./utils/deepMerge";
import { version } from "../package.json";
import { formatTree, resetColorCache } from "./formatting";
import { isEncrypted, maskEncryptedValues, encryptValue, decryptValue } from "./utils/crypto";
import { interpolate, interpolateObject } from "./utils/interpolate";
import { logToolCall, computeStats, classifyOp, getTelemetryPath, TelemetryExtras } from "./utils/telemetry";
import { logAudit, queryAuditLog, sanitizeValue, sanitizeParams, getAuditPath } from "./utils/audit";
import { getEffectiveInstructions } from "./llm-instructions";
import { parsePeriodDays } from "./utils";

function toScope(scopeParam?: string): Scope {
  return (scopeParam ?? 'auto') as Scope;
}

function textResponse(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function errorResponse(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

ensureDataDirectoryExists();

// --- Confirmation token store for two-step codex_run ---
// Tokens are one-time-use and expire after 5 minutes.
import crypto from 'crypto';
const CONFIRM_TOKEN_TTL = 5 * 60 * 1000;
const pendingConfirmations = new Map<string, { key: string; command: string; expires: number }>();

function createConfirmToken(key: string, command: string): string {
  const token = crypto.randomBytes(8).toString('hex');
  pendingConfirmations.set(token, { key, command, expires: Date.now() + CONFIRM_TOKEN_TTL });
  return token;
}

function consumeConfirmToken(token: string, key: string): string | null {
  const entry = pendingConfirmations.get(token);
  if (!entry) return null;
  pendingConfirmations.delete(token);
  if (Date.now() > entry.expires) return null;
  if (entry.key !== key) return null;
  return entry.command;
}

const llmInstructions = getEffectiveInstructions();

const server = new McpServer(
  { name: "codexcli", version },
  { ...(llmInstructions && { instructions: llmInstructions }) },
);

// Wrap server.tool to auto-log telemetry and audit for every tool call
const _origTool = server.tool.bind(server);
const SKIP_AUDIT = new Set(['codex_stats', 'codex_audit']);
const BULK_OPS = new Set(['codex_import', 'codex_reset']);

function extractKey(name: string, params: Record<string, unknown>): string | undefined {
  if (name === 'codex_copy') return (params.dest ?? params.source) as string | undefined;
  if (name === 'codex_alias_set') return params.alias as string | undefined;
  return (params.key ?? params.source ?? params.oldKey ?? params.alias ?? params.searchTerm) as string | undefined;
}

function captureValue(name: string, key: string | undefined, scope: Scope): string | undefined {
  if (!key || BULK_OPS.has(name)) return undefined;
  try {
    // Alias operations: capture the alias target by alias name
    if (name === 'codex_alias_set' || name === 'codex_alias_remove') {
      const aliases = loadAliases(scope);
      return aliases[key];
    }
    // Resolve alias before store lookup so audit reflects the actual mutated entry
    const resolvedKey = resolveKey(key, scope);
    const val = getValue(resolvedKey, scope);
    if (val === undefined) return undefined;
    return sanitizeValue(typeof val === 'object' ? JSON.stringify(val) : String(val));
  } catch { return undefined; }
}

// --- Token-efficiency metric helpers ---

/** Extract the text content from an MCP tool result */
function extractResponseText(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const content = (result as { content?: { text?: string }[] }).content;
  if (!Array.isArray(content)) return '';
  return content.map(c => c.text ?? '').join('');
}

/** Known empty-result patterns that indicate a read "miss" */
const MISS_PATTERNS = [
  'not found',
  'no entries found',
  'no entries stored',
  'no results found',
  'no aliases defined',
  'no audit entries',
];

/** Determine if a read operation was a hit (returned useful data) */
function determineHit(result: unknown, success: boolean): boolean {
  if (!success) return false;
  const text = extractResponseText(result).toLowerCase();
  return !MISS_PATTERNS.some(p => text.includes(p));
}

/** Try to extract entry count from response text */
function extractEntryCount(text: string): number | undefined {
  // codex_context footer: "(N entries)"
  const tierMatch = text.match(/\((\d+) entries?\)/);
  if (tierMatch) return parseInt(tierMatch[1], 10);
  // Count non-empty content lines (rough approximation for listings)
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('[tier:') && !l.startsWith('Aliases:'));
  return lines.length > 0 ? lines.length : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
server.tool = ((...args: any[]) => {
  const name = args[0] as string;
  const origHandler = args[args.length - 1] as (params: Record<string, unknown>, extra: unknown) => Promise<unknown>;
  args[args.length - 1] = async (params: Record<string, unknown>, extra: unknown) => {
    const startTime = Date.now();
    const key = extractKey(name, params);

    const scope = toScope(params.scope as string | undefined);
    const resolvedScope: 'project' | 'global' | undefined =
      scope === 'auto'
        ? (findProjectFile() ? 'project' : 'global')
        : scope as 'project' | 'global' | undefined;

    // Resolve alias for audit trail
    let aliasResolved: string | undefined;
    if (key) {
      try {
        const resolved = resolveKey(key, scope);
        if (resolved !== key) aliasResolved = resolved;
      } catch { /* ignore — alias resolution is best-effort */ }
    }

    const shouldAudit = !SKIP_AUDIT.has(name);
    if (!shouldAudit) return origHandler(params, extra);

    const op = classifyOp(name);
    const isWrite = op === 'write' || op === 'exec';

    // Capture before-value for writes
    let before: string | undefined;
    let copySourceValue: string | undefined;
    if (isWrite && !BULK_OPS.has(name)) {
      before = captureValue(name, key, scope);
      if (name === 'codex_copy') {
        // Pre-capture source value for the after diff (avoids race with concurrent writes)
        const sourceKey = params.source as string | undefined;
        if (sourceKey) {
          try {
            const resolved = resolveKey(sourceKey, scope);
            const val = getValue(resolved, scope);
            copySourceValue = val !== undefined ? sanitizeValue(typeof val === 'object' ? JSON.stringify(val) : String(val)) : undefined;
          } catch { /* ignore */ }
        }
      }
    } else if (isWrite && BULK_OPS.has(name)) {
      try {
        const count = Object.keys(getEntriesFlat(scope)).length;
        before = `${count} entries`;
      } catch { /* ignore */ }
    }

    // Execute handler
    let result: unknown;
    let success = true;
    let errorMsg: string | undefined;
    try {
      result = await origHandler(params, extra);
      if (result && typeof result === 'object' && 'isError' in result && (result as { isError: boolean }).isError) {
        success = false;
        const content = (result as { content?: { text?: string }[] }).content;
        errorMsg = content?.[0]?.text;
      }
    } catch (err) {
      success = false;
      errorMsg = String(err);
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      // Capture after-value for writes.
      // We derive `after` from params/before rather than re-reading the store,
      // because concurrent requests can race and corrupt the read.
      let after: string | undefined;
      if (isWrite && success && !BULK_OPS.has(name)) {
        if (name === 'codex_set' || name === 'codex_config_set') {
          after = sanitizeValue(params.value as string | undefined);
        } else if (name === 'codex_copy') {
          after = copySourceValue;
        } else if (name === 'codex_rename') {
          // Rename preserves the value
          after = before;
        } else if (name === 'codex_remove' || name === 'codex_alias_remove') {
          after = undefined; // Entry was deleted
        } else if (name === 'codex_alias_set') {
          after = params.path as string | undefined;
        } else {
          // Fallback: re-read (only for unexpected tool names)
          after = captureValue(name, key, scope);
        }
      } else if (isWrite && BULK_OPS.has(name) && success) {
        try {
          const count = Object.keys(getEntriesFlat(scope)).length;
          after = `${count} entries`;
        } catch { /* ignore */ }
      }

      // Token-efficiency metrics
      const responseText = extractResponseText(result);
      const responseSize = Buffer.byteLength(responseText, 'utf8');
      const requestSize = Buffer.byteLength(JSON.stringify(params), 'utf8');
      const hit = op === 'read' ? determineHit(result, success) : undefined;
      const tier = name === 'codex_context' ? (params.tier as string ?? 'standard') : undefined;
      const entryCount = op === 'read' && success ? extractEntryCount(responseText) : undefined;
      // Redundant = value didn't change on a true mutation. Exclude rename (key move, not value change),
      // run --dry (read-only), and import --preview (read-only) from redundant detection.
      const isReadOnlyWrite = (name === 'codex_rename') ||
        (name === 'codex_run' && params.dry === true) ||
        (name === 'codex_import' && params.preview === true);
      const redundant = isWrite && !isReadOnlyWrite && before !== undefined && after !== undefined && before === after ? true : undefined;

      // Telemetry (enriched, moved here so we have duration + metrics)
      const projectFile = findProjectFile();
      const telemetryExtras: TelemetryExtras = {
        duration,
        hit,
        redundant,
        responseSize,
        project: projectFile ? path.dirname(projectFile) : undefined,
      };
      void logToolCall(name, key, 'mcp', resolvedScope, telemetryExtras);

      void logAudit({
        src: 'mcp',
        tool: name,
        op,
        key,
        scope: (params.scope as string) ?? 'auto',
        success,
        before: isWrite ? before : undefined,
        after: isWrite ? after : undefined,
        error: errorMsg,
        params: sanitizeParams(params),
        duration,
        aliasResolved,
        responseSize,
        requestSize,
        hit,
        tier,
        entryCount,
        redundant,
      });
    }

    return result;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return (_origTool as (...a: any[]) => unknown)(...args);
}) as typeof server.tool;

// --- codex_set ---
server.tool(
  "codex_set",
  "Store project knowledge as a key-value entry (dot notation, e.g. arch.api). Use to persist non-obvious insights across sessions.",
  { key: z.string().describe("Dot-notation key (e.g. server.prod.ip)"), value: z.string().describe("Value to store"), alias: z.string().optional().describe("Create an alias for this key"), encrypt: z.boolean().optional().describe("Encrypt the value with the provided password"), password: z.string().optional().describe("Password for encryption (required when encrypt is true)"), scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)") },
  async ({ key, value, alias, encrypt, password, scope: scopeParam }) => {
    try {
      const scope = toScope(scopeParam);
      ensureDataDirectoryExists();
      const resolved = resolveKey(key, scope);
      let storedValue = value;
      if (encrypt) {
        if (!password) {
          return errorResponse("Password is required when encrypt is true.");
        }
        storedValue = encryptValue(value, password);
      }
      setValue(resolved, storedValue, scope);
      if (alias) {
        setAlias(alias, resolved, scope);
        return textResponse(`Set: ${resolved} = ${encrypt ? '[encrypted]' : value}\nAlias set: ${alias} -> ${resolved}`);
      }
      return textResponse(`Set: ${resolved} = ${encrypt ? '[encrypted]' : value}`);
    } catch (err) {
      return errorResponse(`Error setting entry: ${String(err)}`);
    }
  }
);

// --- codex_get ---
server.tool(
  "codex_get",
  "Retrieve stored project knowledge by dot-notation key, or list all entries. Check here before exploring code.",
  {
    key: z.string().optional().describe("Dot-notation key to retrieve (omit for all entries)"),
    format: z.enum(["flat", "tree"]).optional().describe("Output format: flat (default) or tree"),
    aliases_only: z.boolean().optional().describe("Show aliases only"),
    values: z.boolean().optional().describe("Include values in output (default: false; leaf values always include their value)"),
    depth: z.number().optional().describe("Limit key depth (e.g. 1 for top-level only, 2 for two levels)"),
    decrypt: z.boolean().optional().describe("Decrypt an encrypted value"),
    password: z.string().optional().describe("Password for decryption (required when decrypt is true)"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
    all: z.boolean().optional().describe("Show entries from all scopes (project + global) when listing"),
  },
  async ({ key, format, aliases_only, values, depth, decrypt: decryptOpt, password, scope: scopeParam, all: showAll }) => {
    try {
      const hasProject = !!findProjectFile();
      // For listings: default to project-only when project exists (unless --all or explicit scope)
      const listingScope: Scope = scopeParam ? scopeParam as Scope : (hasProject && !showAll) ? 'project' : 'auto';
      // For single-key lookups: auto fallthrough
      const lookupScope = toScope(scopeParam);
      const data = loadData(listingScope);
      const keyToAliasMap = buildKeyToAliasMap();

      // No key — return entries and/or aliases
      if (!key) {
        // Aliases only
        if (aliases_only) {
          const aliases = loadAliases(listingScope);
          const entries = Object.entries(aliases);
          if (entries.length === 0) {
            return textResponse("No aliases defined.");
          }
          const lines = entries.map(([a, t]) => `${a} -> ${t}`);
          return textResponse(lines.join("\n"));
        }

        // Show all scopes with section headers
        if (showAll && hasProject) {
          const sections: string[] = [];
          for (const s of ['project', 'global'] as const) {
            const sData = loadData(s);
            const label = s === 'project' ? 'Project' : 'Global';
            sections.push(`${label}:`);
            if (Object.keys(sData).length > 0) {
              const flat = flattenObject(sData, '', depth);
              const showValues = values ?? false;
              if (showValues) {
                const lines = Object.entries(flat).map(([k, v]) => `  ${k}: ${isEncrypted(v) ? '[encrypted]' : v}`);
                sections.push(lines.join("\n"));
              } else {
                sections.push(Object.keys(flat).map(k => `  ${k}`).join("\n"));
              }
            } else {
              sections.push("  No entries found.");
            }
          }
          return textResponse(sections.join("\n"));
        }

        const sections: string[] = [];

        // Entries
        if (Object.keys(data).length > 0) {
          const showValues = values ?? false;
          if (format === "tree") {
            sections.push(formatTree(data, keyToAliasMap, '', '', false, false, undefined, false, !showValues, depth));
          } else {
            const flat = flattenObject(data, '', depth);
            if (showValues) {
              const lines = Object.entries(flat).map(([k, v]) => `${k}: ${isEncrypted(v) ? '[encrypted]' : v}`);
              sections.push(lines.join("\n"));
            } else {
              sections.push(Object.keys(flat).join("\n"));
            }
          }
        } else {
          sections.push("No entries found.");
        }

        return textResponse(sections.join("\n"));
      }

      // Resolve potential alias
      const resolvedKey = resolveKey(key, lookupScope);
      const value = getValue(resolvedKey, lookupScope);

      if (value === undefined) {
        return errorResponse(`Key '${key}' not found.`);
      }

      // Leaf value
      if (typeof value !== "object" || value === null) {
        const strVal = String(value);
        let display: string | number | boolean;
        if (isEncrypted(strVal)) {
          if (decryptOpt) {
            if (!password) {
              return errorResponse("Password is required when decrypt is true.");
            }
            try {
              const decrypted = decryptValue(strVal, password);
              display = decrypted;
            } catch {
              return errorResponse("Decryption failed. Wrong password or corrupted data.");
            }
          } else {
            display = '[encrypted]';
          }
        } else if (typeof value === 'string') {
          try { display = interpolate(strVal); } catch { display = value; }
        } else {
          display = value;
        }
        return textResponse(`${resolvedKey}: ${display}`);
      }

      // Object subtree
      const showSubtreeValues = values ?? false;
      if (format === "tree") {
        return textResponse(formatTree(value, keyToAliasMap, '', resolvedKey, false, false, undefined, false, !showSubtreeValues, depth));
      }
      const flat = flattenObject(value, resolvedKey, depth);
      if (showSubtreeValues) {
        const interpFlat = interpolateObject(flat as Record<string, import("./types").CodexValue>);
        const lines = Object.entries(interpFlat).map(([k, v]) => {
          const strVal = typeof v === 'string' ? v : JSON.stringify(v);
          return `${k}: ${isEncrypted(strVal) ? '[encrypted]' : strVal}`;
        });
        return textResponse(lines.join("\n"));
      }
      return textResponse(Object.keys(flat).join("\n"));
    } catch (err) {
      return errorResponse(`Error retrieving entry: ${String(err)}`);
    }
  }
);

// --- codex_remove ---
server.tool(
  "codex_remove",
  "Remove a stored entry by dot-notation key. Use when knowledge is outdated or incorrect.",
  {
    key: z.string().describe("Dot-notation key to remove"),
    is_alias: z.boolean().optional().describe("If true, remove the alias only (keep the entry)"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
  },
  async ({ key, is_alias, scope: scopeParam }) => {
    try {
      const scope = toScope(scopeParam);
      if (is_alias) {
        const aliases = loadAliases(scope);
        if (!(key in aliases)) {
          return errorResponse(`Alias '${key}' not found.`);
        }
        delete aliases[key];
        saveAliases(aliases, scope);
        return textResponse(`Alias removed: ${key}`);
      }

      const resolvedKey = resolveKey(key, scope);
      const removed = removeValue(resolvedKey, scope);
      if (!removed) {
        return errorResponse(`Key '${key}' not found.`);
      }
      // Cascade delete: remove any aliases and confirm metadata for this key or its children
      removeAliasesForKey(resolvedKey, scope);
      removeConfirmForKey(resolvedKey, scope);
      return textResponse(`Removed: ${resolvedKey}`);
    } catch (err) {
      return errorResponse(`Error removing entry: ${String(err)}`);
    }
  }
);

// --- codex_copy ---
server.tool(
  "codex_copy",
  "Copy an entry to a new key in the CodexCLI data store",
  {
    source: z.string().describe("Source dot-notation key to copy from"),
    dest: z.string().describe("Destination dot-notation key to copy to"),
    force: z.boolean().optional().describe("Overwrite destination if it already exists"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
  },
  async ({ source, dest, force, scope: scopeParam }) => {
    try {
      const scope = toScope(scopeParam);
      ensureDataDirectoryExists();
      const resolvedSource = resolveKey(source, scope);
      const value = getValue(resolvedSource, scope);

      if (value === undefined) {
        return errorResponse(`Key '${source}' not found.`);
      }

      const existing = getValue(dest, scope);
      if (existing !== undefined && !force) {
        return errorResponse(`Key '${dest}' already exists. Pass force: true to overwrite.`);
      }

      if (typeof value === "string") {
        setValue(dest, value, scope);
      } else {
        // Batch: load once, set all leaves, save once
        const data = loadEntries(scope);
        for (const [flatKey, flatVal] of Object.entries(flattenObject({ [resolvedSource]: value }))) {
          setNestedValue(data, dest + flatKey.slice(resolvedSource.length), String(flatVal));
        }
        saveEntriesAndTouchMeta(data, dest, scope);
      }

      return textResponse(`Copied: ${resolvedSource} -> ${dest}`);
    } catch (err) {
      return errorResponse(`Error copying entry: ${String(err)}`);
    }
  }
);

// --- codex_rename ---
server.tool(
  "codex_rename",
  "Rename an entry key or alias in the CodexCLI data store",
  {
    oldKey: z.string().describe("Current dot-notation key (or alias name when is_alias is true)"),
    newKey: z.string().describe("New dot-notation key (or alias name when is_alias is true)"),
    is_alias: z.boolean().optional().describe("If true, rename the alias itself (not the entry key)"),
    alias: z.string().optional().describe("Create a new alias for the renamed entry"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
  },
  async ({ oldKey, newKey, is_alias, alias, scope: scopeParam }) => {
    try {
      const scope = toScope(scopeParam);

      // Alias rename mode
      if (is_alias) {
        const result = renameAlias(oldKey, newKey, scope);
        if (!result) {
          const aliases = loadAliases(scope);
          if (!(oldKey in aliases)) {
            return errorResponse(`Alias '${oldKey}' not found.`);
          }
          return errorResponse(`Alias '${newKey}' already exists.`);
        }
        return textResponse(`Alias '${oldKey}' renamed to '${newKey}'.`);
      }

      // Entry key rename
      const resolvedOld = resolveKey(oldKey, scope);
      const value = getValue(resolvedOld, scope);
      if (value === undefined) {
        return errorResponse(`Key '${oldKey}' not found.`);
      }

      const existing = getValue(newKey, scope);
      if (existing !== undefined) {
        return errorResponse(`Key '${newKey}' already exists. Remove it first or choose a different key.`);
      }

      // Move the value
      if (typeof value === 'string') {
        setValue(newKey, value, scope);
      } else {
        // Batch: load once, set all leaves, save once
        const data = loadEntries(scope);
        for (const [flatKey, flatVal] of Object.entries(flattenObject({ [resolvedOld]: value }))) {
          setNestedValue(data, newKey + flatKey.slice(resolvedOld.length), String(flatVal));
        }
        saveEntriesAndTouchMeta(data, newKey, scope);
      }
      removeValue(resolvedOld, scope);

      // Update aliases: re-point any alias targeting oldKey (or children) to newKey
      const aliases = loadAliases(scope);
      const oldPrefix = resolvedOld + '.';
      const updates: [string, string][] = [];
      for (const [a, target] of Object.entries(aliases)) {
        if (target === resolvedOld) {
          updates.push([a, newKey]);
        } else if (target.startsWith(oldPrefix)) {
          updates.push([a, newKey + target.slice(resolvedOld.length)]);
        }
      }

      if (updates.length > 0) {
        // Enforce one-alias-per-entry: remove any existing alias already pointing to a new target
        const newTargets = new Set(updates.map(([, t]) => t));
        for (const [a, target] of Object.entries(aliases)) {
          if (newTargets.has(target)) {
            delete aliases[a];
          }
        }
        for (const [a, newTarget] of updates) {
          aliases[a] = newTarget;
        }
        saveAliases(aliases, scope);
      }

      // Move confirm metadata
      if (hasConfirm(resolvedOld)) {
        removeConfirm(resolvedOld, scope);
        setConfirm(newKey, scope);
      }

      // Set a new alias on the renamed key
      if (alias) {
        setAlias(alias, newKey, scope);
      }

      return textResponse(`Renamed: ${resolvedOld} -> ${newKey}`);
    } catch (err) {
      return errorResponse(`Error renaming entry: ${String(err)}`);
    }
  }
);

// --- codex_search ---
server.tool(
  "codex_search",
  "Search stored project knowledge by keyword. Use to find relevant context before reading code.",
  {
    searchTerm: z.string().describe("Term to search for (case-insensitive substring, or regex if regex=true)"),
    regex: z.boolean().optional().describe("Treat searchTerm as a regular expression"),
    keysOnly: z.boolean().optional().describe("Match against keys only (skip values)"),
    valuesOnly: z.boolean().optional().describe("Match against values only (skip keys)"),
    aliasesOnly: z.boolean().optional().describe("Search only in aliases"),
    entriesOnly: z.boolean().optional().describe("Search only in data entries"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
  },
  async ({ searchTerm, regex, keysOnly, valuesOnly, aliasesOnly, entriesOnly, scope: scopeParam }) => {
    try {
      if (keysOnly && valuesOnly) {
        return errorResponse("'keysOnly' and 'valuesOnly' are mutually exclusive.");
      }
      const scope = toScope(scopeParam);
      let match: (text: string) => boolean;
      try {
        if (regex) {
          if (searchTerm.length > 500) {
            return errorResponse("Regex pattern too long (max 500 characters).");
          }
          const re = new RegExp(searchTerm, 'i');
          match = (text: string) => re.test(text);
        } else {
          const lc = searchTerm.toLowerCase();
          match = (text: string) => text.toLowerCase().includes(lc);
        }
      } catch (err) {
        return errorResponse(`Invalid regex: ${err instanceof Error ? err.message : String(err)}`);
      }
      const results: string[] = [];

      if (!aliasesOnly) {
        const flat = getEntriesFlat(scope);
        for (const [k, v] of Object.entries(flat)) {
          const encrypted = isEncrypted(v);
          const keyMatch = !valuesOnly && match(k);
          const valueMatch = !keysOnly && !encrypted && match(String(v));

          if (keyMatch || valueMatch) {
            results.push(`${k}: ${encrypted ? '[encrypted]' : v}`);
          }
        }
      }

      if (!entriesOnly) {
        const aliases = loadAliases(scope);
        for (const [alias, target] of Object.entries(aliases)) {
          if (match(alias) || match(target)) {
            results.push(`[alias] ${alias} -> ${target}`);
          }
        }
      }

      if (results.length === 0) {
        return textResponse(`No results found for '${searchTerm}'.`);
      }
      return textResponse(results.join("\n"));
    } catch (err) {
      return errorResponse(`Error searching: ${String(err)}`);
    }
  }
);

// --- codex_alias_set ---
server.tool(
  "codex_alias_set",
  "Create or update an alias for a dot-notation path",
  {
    alias: z.string().describe("Alias name"),
    path: z.string().describe("Dot-notation path the alias points to"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
  },
  async ({ alias, path, scope: scopeParam }) => {
    try {
      const scope = toScope(scopeParam);
      setAlias(alias, path, scope);
      return textResponse(`Alias set: ${alias} -> ${path}`);
    } catch (err) {
      return errorResponse(`Error setting alias: ${String(err)}`);
    }
  }
);

// --- codex_alias_remove ---
server.tool(
  "codex_alias_remove",
  "Remove an alias",
  { alias: z.string().describe("Alias name to remove"), scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)") },
  async ({ alias, scope: scopeParam }) => {
    try {
      const scope = toScope(scopeParam);
      const removed = removeAlias(alias, scope);
      if (!removed) {
        return errorResponse(`Alias '${alias}' not found.`);
      }
      return textResponse(`Alias removed: ${alias}`);
    } catch (err) {
      return errorResponse(`Error removing alias: ${String(err)}`);
    }
  }
);

// --- codex_alias_list ---
server.tool(
  "codex_alias_list",
  "List all aliases",
  { scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)") },
  async ({ scope: scopeParam }) => {
    try {
      const scope = toScope(scopeParam);
      const aliases = loadAliases(scope);
      const entries = Object.entries(aliases);
      if (entries.length === 0) {
        return textResponse("No aliases defined.");
      }
      const lines = entries.map(([a, t]) => `${a} -> ${t}`);
      return textResponse(lines.join("\n"));
    } catch (err) {
      return errorResponse(`Error listing aliases: ${String(err)}`);
    }
  }
);

// --- codex_run ---
server.tool(
  "codex_run",
  "Execute a stored shell command by key (e.g. commands.build). Supports interpolation and confirmation prompts.",
  {
    key: z.string().describe("Dot-notation key (or alias) whose value is a shell command"),
    dry: z.boolean().optional().describe("If true, return the command without executing it"),
    force: z.boolean().optional().describe("If true, skip the confirm check for entries marked --confirm"),
    confirm_token: z.string().optional().describe("One-time token from a previous confirmation prompt — pass this to execute a confirmed command"),
    chain: z.boolean().optional().describe("If true, treat stored value as space-separated key references to resolve and &&-chain"),
    capture: z.boolean().optional().describe("Capture output (MCP always captures; included for API consistency)"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
  },
  async ({ key, dry, force, confirm_token, chain, scope: scopeParam }) => {
    const scope = toScope(scopeParam);
    const resolvedKey = resolveKey(key, scope);
    const value = getValue(resolvedKey, scope);

    if (value === undefined) {
      return errorResponse(`Key '${key}' not found.`);
    }
    if (typeof value !== "string") {
      return errorResponse(`Value at '${key}' is not a string command.`);
    }

    // --chain: split value into key references, resolve each, and &&-chain
    if (chain) {
      const trimmedValue = value.trim();
      if (!trimmedValue) {
        return errorResponse(`Value at '${key}' is empty and cannot be used with chain mode.`);
      }
      const chainKeys = trimmedValue.split(/\s+/).filter(Boolean);
      const commands: string[] = [];
      for (const ck of chainKeys) {
        const rk = resolveKey(ck, scope);
        const cv = getValue(rk, scope);
        if (cv === undefined) return errorResponse(`Chain key '${ck}' not found.`);
        if (typeof cv !== 'string') return errorResponse(`Chain key '${ck}' is not a string command.`);
        if (isEncrypted(cv)) return errorResponse(`Chain key '${ck}' is encrypted.`);
        if (hasConfirm(rk) && !force && !dry) {
          // Two-step confirmation: if token provided, validate; otherwise issue one
          if (confirm_token) {
            const validated = consumeConfirmToken(confirm_token, key);
            if (!validated) return errorResponse(`Invalid or expired confirm_token for '${key}'.`);
          } else {
            // Build the full chain command for the confirmation prompt
            const previewCmds = [...commands];
            try { previewCmds.push(interpolate(cv)); } catch { previewCmds.push(cv); }
            for (let j = chainKeys.indexOf(ck) + 1; j < chainKeys.length; j++) {
              const pk = resolveKey(chainKeys[j], scope);
              const pv = getValue(pk, scope);
              if (pv && typeof pv === 'string') try { previewCmds.push(interpolate(pv)); } catch { previewCmds.push(pv); }
            }
            const fullCmd = previewCmds.join(' && ');
            const token = createConfirmToken(key, fullCmd);
            return textResponse(`⚠ This command requires confirmation before execution:\n$ ${fullCmd}\n\nTo execute, call codex_run again with confirm_token: "${token}"`);
          }
        }
        try { commands.push(interpolate(cv)); } catch (err) {
          return errorResponse(`Interpolation error in '${ck}': ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const command = commands.join(' && ');
      if (dry) return textResponse(`$ ${command}`);
      try {
        const stdout = execSync(command, { encoding: "utf-8", shell: process.env.SHELL ?? "/bin/sh", timeout: 30000 });
        return textResponse(`$ ${command}\n${stdout}`);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "status" in err) {
          const execErr = err as { status: number; stderr?: string };
          return errorResponse(`$ ${command}\nCommand failed (exit ${execErr.status}): ${execErr.stderr ?? ""}`);
        }
        return errorResponse(`Error running command: ${String(err)}`);
      }
    }

    if (isEncrypted(value)) {
      return errorResponse(`Value at '${key}' is encrypted. Decryption is not supported via MCP.`);
    }

    let command = value;
    try {
      command = interpolate(value);
    } catch (err) {
      return errorResponse(`Interpolation error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (dry) {
      return textResponse(`$ ${command}`);
    }

    // Respect confirm metadata: two-step confirmation for MCP callers
    if (hasConfirm(resolvedKey) && !force) {
      if (confirm_token) {
        const validated = consumeConfirmToken(confirm_token, key);
        if (!validated) {
          return errorResponse(`Invalid or expired confirm_token for '${key}'.`);
        }
        // Token valid — fall through to execution
      } else {
        const token = createConfirmToken(key, command);
        return textResponse(
          `⚠ This command requires confirmation before execution:\n$ ${command}\n\nTo execute, call codex_run again with confirm_token: "${token}"`
        );
      }
    }

    try {
      const stdout = execSync(command, {
        encoding: "utf-8",
        shell: process.env.SHELL ?? "/bin/sh",
        timeout: 30000,
      });
      return textResponse(`$ ${command}\n${stdout}`);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err) {
        const execErr = err as { status: number; stderr?: string };
        return errorResponse(
          `$ ${command}\nCommand failed (exit ${execErr.status}): ${execErr.stderr ?? ""}`
        );
      }
      return errorResponse(`Error running command: ${String(err)}`);
    }
  }
);

// --- codex_config_get ---
server.tool(
  "codex_config_get",
  "Get configuration settings",
  {
    key: z.string().optional().describe("Config key (colors, theme). Omit for all settings."),
  },
  async ({ key }) => {
    try {
      if (!key) {
        const config = loadConfig();
        const lines = Object.entries(config).map(([k, v]) => `${k}: ${v}`);
        return textResponse(lines.join("\n"));
      }

      const value = getConfigSetting(key);
      if (value === null) {
        return errorResponse(`Unknown config key: '${key}'`);
      }
      return textResponse(`${key}: ${value}`);
    } catch (err) {
      return errorResponse(`Error getting config: ${String(err)}`);
    }
  }
);

// --- codex_config_set ---
server.tool(
  "codex_config_set",
  "Set a configuration setting",
  {
    key: z.string().describe("Config key to set (colors, theme)"),
    value: z.string().describe("Value to set"),
  },
  async ({ key, value }) => {
    try {
      if (!(VALID_CONFIG_KEYS as readonly string[]).includes(key)) {
        return errorResponse(
          `Unknown config key: '${key}'. Valid keys: ${VALID_CONFIG_KEYS.join(", ")}`
        );
      }

      setConfigSetting(key, value);
      resetColorCache();
      return textResponse(`Config set: ${key} = ${value}`);
    } catch (err) {
      return errorResponse(`Error setting config: ${String(err)}`);
    }
  }
);

// --- codex_export ---
server.tool(
  "codex_export",
  "Export entries and/or aliases as JSON text",
  {
    type: z.enum(["entries", "aliases", "confirm", "all"]).describe("What to export"),
    pretty: z.boolean().optional().describe("Pretty-print the JSON (default false)"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
  },
  async ({ type, pretty, scope: scopeParam }) => {
    try {
      const scope = toScope(scopeParam);
      const indent = pretty ? 2 : 0;

      if (type === "all") {
        const combined = { entries: maskEncryptedValues(loadData(scope)), aliases: loadAliases(scope), confirm: loadConfirmKeys(scope) };
        return textResponse(JSON.stringify(combined, null, indent));
      }

      if (type === "confirm") {
        return textResponse(JSON.stringify(loadConfirmKeys(scope), null, indent));
      }

      const content = type === "entries" ? maskEncryptedValues(loadData(scope)) : loadAliases(scope);
      return textResponse(JSON.stringify(content, null, indent));
    } catch (err) {
      return errorResponse(`Error exporting: ${String(err)}`);
    }
  }
);

// --- codex_import ---
server.tool(
  "codex_import",
  "Import entries and/or aliases from a JSON string",
  {
    type: z.enum(["entries", "aliases", "confirm", "all"]).describe("What to import"),
    json: z.string().describe("JSON string to import"),
    merge: z.boolean().optional().describe("Merge with existing data instead of replacing (default false)"),
    preview: z.boolean().optional().describe("Preview changes without modifying data (returns diff text)"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
  },
  async ({ type, json, merge, preview, scope: scopeParam }) => {
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return errorResponse("Invalid JSON string.");
      }

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return errorResponse("JSON must be an object.");
      }

      const obj = parsed as Record<string, unknown>;
      const scope = toScope(scopeParam);

      // Preview mode: compute diff and return without modifying data
      if (preview) {
        const lines: string[] = [];

        const diffEntries = (current: Record<string, string>, incoming: Record<string, string>, doMerge: boolean): string[] => {
          const result: string[] = [];
          if (doMerge) {
            const allKeys = new Set([...Object.keys(current), ...Object.keys(incoming)]);
            for (const key of [...allKeys].sort()) {
              if (key in incoming && !(key in current)) {
                result.push(`  [add]    ${key}: ${incoming[key]}`);
              } else if (key in incoming && key in current && current[key] !== incoming[key]) {
                result.push(`  [modify] ${key}: ${current[key]} → ${incoming[key]}`);
              }
            }
          } else {
            for (const key of Object.keys(current).sort()) {
              if (!(key in incoming) || current[key] !== incoming[key]) {
                result.push(`  [remove] ${key}: ${current[key]}`);
              }
            }
            for (const key of Object.keys(incoming).sort()) {
              if (!(key in current) || current[key] !== incoming[key]) {
                result.push(`  [add]    ${key}: ${incoming[key]}`);
              }
            }
          }
          return result;
        };

        if (type === "entries" || type === "all") {
          const importObj = type === "all" ? (obj.entries as Record<string, unknown> || {}) : obj;
          const currentFlat = flattenObject(loadData(scope));
          const importFlat = flattenObject(importObj);
          lines.push(`Entries (${merge ? "merge" : "replace"}):`);
          const diff = diffEntries(currentFlat, importFlat, !!merge);
          lines.push(...(diff.length > 0 ? diff : ["  No changes"]));
        }

        if (type === "aliases" || type === "all") {
          const importObj = type === "all" ? (obj.aliases as Record<string, string> || {}) : obj as Record<string, string>;
          const currentAliases = loadAliases(scope);
          const currentFlat: Record<string, string> = {};
          const importFlat: Record<string, string> = {};
          for (const [k, v] of Object.entries(currentAliases)) currentFlat[k] = v;
          for (const [k, v] of Object.entries(importObj)) importFlat[k] = String(v);
          lines.push(`Aliases (${merge ? "merge" : "replace"}):`);
          const diff = diffEntries(currentFlat, importFlat, !!merge);
          lines.push(...(diff.length > 0 ? diff : ["  No changes"]));
        }

        if (type === "confirm" || type === "all") {
          const importObj = type === "all" ? (obj.confirm as Record<string, unknown> || {}) : obj;
          const currentConfirm = loadConfirmKeys(scope);
          const currentFlat: Record<string, string> = {};
          const importFlat: Record<string, string> = {};
          for (const k of Object.keys(currentConfirm)) currentFlat[k] = "true";
          for (const k of Object.keys(importObj)) importFlat[k] = "true";
          lines.push(`Confirm keys (${merge ? "merge" : "replace"}):`);
          const diff = diffEntries(currentFlat, importFlat, !!merge);
          lines.push(...(diff.length > 0 ? diff : ["  No changes"]));
        }

        lines.push("\nThis is a preview. No data was modified.");
        return textResponse(lines.join("\n"));
      }

      if (type === "all") {
        const dataVal = obj.entries;
        const aliasesVal = obj.aliases;
        if (
          typeof dataVal !== "object" || dataVal === null || Array.isArray(dataVal) ||
          typeof aliasesVal !== "object" || aliasesVal === null || Array.isArray(aliasesVal)
        ) {
          return errorResponse(
            'Import with type "all" requires {"entries": {...}, "aliases": {...}}.'
          );
        }

        const dataObj = dataVal as Record<string, unknown>;
        const aliasesObj = aliasesVal as Record<string, unknown>;

        if (Object.values(aliasesObj).some(v => typeof v !== "string")) {
          return errorResponse("Alias values must all be strings (dot-notation paths).");
        }

        const currentData = merge ? loadData(scope) : {};
        saveData((merge ? deepMerge(currentData, dataObj) : dataObj) as CodexData, scope);

        const currentAliases = merge ? loadAliases(scope) : {};
        saveAliases(merge ? { ...currentAliases, ...(aliasesObj as Record<string, string>) } : aliasesObj as Record<string, string>, scope);

        // Import confirm keys if present; reset to empty when replacing and key is absent
        const confirmVal = obj.confirm;
        if (confirmVal && typeof confirmVal === "object" && !Array.isArray(confirmVal)) {
          const currentConfirm = merge ? loadConfirmKeys(scope) : {};
          saveConfirmKeys(merge ? { ...currentConfirm, ...(confirmVal as Record<string, true>) } : confirmVal as Record<string, true>, scope);
        } else if (!merge) {
          saveConfirmKeys({}, scope);
        }
      } else if (type === "entries") {
        const current = merge ? loadData(scope) : {};
        const newData = merge ? deepMerge(current, obj) : obj;
        saveData(newData as CodexData, scope);
      } else if (type === "confirm") {
        const currentConfirm = merge ? loadConfirmKeys(scope) : {};
        const newConfirm = merge ? { ...currentConfirm, ...(obj as Record<string, true>) } : obj;
        saveConfirmKeys(newConfirm as Record<string, true>, scope);
      } else {
        if (Object.values(obj).some(v => typeof v !== "string")) {
          return errorResponse("Alias values must all be strings (dot-notation paths).");
        }

        const current = merge ? loadAliases(scope) : {};
        const newAliases = merge
          ? { ...current, ...(obj as Record<string, string>) }
          : obj;
        saveAliases(newAliases as Record<string, string>, scope);
      }

      const typeLabel = { all: "Entries, aliases, and confirm keys", entries: "Entries", aliases: "Aliases", confirm: "Confirm keys" }[type];
      return textResponse(
        `${typeLabel} ${merge ? "merged" : "imported"} successfully.`
      );
    } catch (err) {
      return errorResponse(`Error importing: ${String(err)}`);
    }
  }
);

// --- codex_reset ---
server.tool(
  "codex_reset",
  "Reset entries and/or aliases to empty state, or clear audit/telemetry logs",
  {
    type: z.enum(["entries", "aliases", "confirm", "all", "audit", "telemetry"]).describe("What to reset ('all' covers entries+aliases+confirm, not logs)"),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global). Ignored for audit/telemetry."),
  },
  async ({ type, scope: scopeParam }) => {
    try {
      // Log-file resets — global only
      if (type === "audit" || type === "telemetry") {
        const file = type === "audit" ? getAuditPath() : getTelemetryPath();
        if (fs.existsSync(file)) fs.unlinkSync(file);
        return textResponse(`${type === "audit" ? "Audit log" : "Telemetry"} has been cleared.`);
      }

      const scope = toScope(scopeParam);
      if (type === "entries" || type === "all") {
        saveData({}, scope);
      }
      if (type === "aliases" || type === "all") {
        saveAliases({}, scope);
      }
      if (type === "confirm" || type === "all") {
        saveConfirmKeys({}, scope);
      }
      const typeLabel = { all: "Entries, aliases, and confirm keys", entries: "Entries", aliases: "Aliases", confirm: "Confirm keys" }[type];
      return textResponse(
        `${typeLabel} reset to empty state.`
      );
    } catch (err) {
      return errorResponse(`Error resetting: ${String(err)}`);
    }
  }
);

// --- codex_context ---

const ESSENTIAL_PREFIXES = ['project.', 'commands.', 'conventions.'];
const STANDARD_EXCLUDE_PREFIXES = ['arch.'];

function filterEntriesByTier(
  flat: Record<string, string>,
  tier: 'essential' | 'standard' | 'full'
): Record<string, string> {
  if (tier === 'full') return flat;
  if (tier === 'essential') {
    return Object.fromEntries(
      Object.entries(flat).filter(([k]) => ESSENTIAL_PREFIXES.some(p => k.startsWith(p)))
    );
  }
  // standard: exclude arch.*
  return Object.fromEntries(
    Object.entries(flat).filter(([k]) => !STANDARD_EXCLUDE_PREFIXES.some(p => k.startsWith(p)))
  );
}

server.tool(
  "codex_context",
  "Get a compact summary of stored project knowledge (use at session start). Supports tier param: essential (minimal), standard (default, excludes arch), full (everything)",
  {
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
    tier: z.enum(["essential", "standard", "full"]).optional().describe("Context tier: essential (project/commands/conventions only), standard (default, excludes arch.*), full (everything)"),
  },
  async ({ scope: scopeParam, tier }) => {
    try {
      const hasProject = !!findProjectFile();
      const effectiveScope: Scope = scopeParam ? scopeParam as Scope : hasProject ? 'project' : 'auto';

      const flat = getEntriesFlat(effectiveScope);
      const effectiveTier = tier ?? 'standard';
      const filtered = filterEntriesByTier(flat, effectiveTier);
      const aliases = loadAliases(effectiveScope);

      if (Object.keys(filtered).length === 0 && Object.keys(aliases).length === 0) {
        return textResponse("No entries stored. Use codex_set to add project knowledge.");
      }

      // Load meta for age indicators
      const { loadMeta, loadMetaMerged } = await import("./store");
      const meta = effectiveScope === 'auto' ? loadMetaMerged() : loadMeta(effectiveScope);
      const STALE_DAYS = 30;
      const staleCutoff = Date.now() - STALE_DAYS * 86400000;

      const lines: string[] = [];

      if (Object.keys(filtered).length > 0) {
        for (const [k, v] of Object.entries(filtered)) {
          const ts = meta[k];
          let ageTag = '';
          if (ts !== undefined && ts < staleCutoff) {
            ageTag = ` [${Math.floor((Date.now() - ts) / 86400000)}d]`;
          }
          lines.push(`${k}: ${isEncrypted(v) ? '[encrypted]' : v}${ageTag}`);
        }
      }

      if (Object.keys(aliases).length > 0) {
        lines.push('');
        lines.push('Aliases:');
        for (const [a, t] of Object.entries(aliases)) {
          lines.push(`  ${a} -> ${t}`);
        }
      }

      const entryCount = Object.keys(filtered).length;
      if (effectiveTier !== 'full') {
        lines.push('');
        lines.push(`[tier: ${effectiveTier} (${entryCount} entries) — pass tier:"full" for complete context]`);
      }

      return textResponse(lines.join("\n"));
    } catch (err) {
      return errorResponse(`Error loading context: ${String(err)}`);
    }
  }
);

// --- codex_stale ---
server.tool(
  "codex_stale",
  "Find entries that haven't been updated recently (helps identify stale knowledge)",
  {
    days: z.number().int().min(0).optional().describe("Threshold in days (default: 30). Entries not updated in this many days are returned."),
    scope: z.enum(["project", "global"]).optional().describe("Data scope (omit for auto: project if available, else global)"),
  },
  async ({ days, scope: scopeParam }) => {
    try {
      const threshold = days ?? 30;
      const scope = toScope(scopeParam);
      const { loadMeta, loadMetaMerged } = await import("./store");
      const meta = scope === 'auto' ? loadMetaMerged() : loadMeta(scope);
      const flat = getEntriesFlat(scope);
      const cutoff = Date.now() - threshold * 86400000;

      const stale: string[] = [];
      for (const key of Object.keys(flat)) {
        const ts = meta[key];
        if (ts === undefined || ts < cutoff) {
          const age = ts ? `${Math.floor((Date.now() - ts) / 86400000)}d ago` : 'never tracked';
          stale.push(`${key}  (${age})`);
        }
      }

      if (stale.length === 0) {
        return textResponse(`No entries older than ${threshold} days.`);
      }
      return textResponse(`${stale.length} entries not updated in ${threshold}+ days:\n${stale.join('\n')}`);
    } catch (err) {
      return errorResponse(`Error checking staleness: ${String(err)}`);
    }
  }
);

// --- codex_stats ---
server.tool(
  "codex_stats",
  "View MCP usage telemetry and trending metrics for AI agent effectiveness",
  {
    period: z.enum(["7d", "30d", "90d", "all"]).optional().describe("Time period to analyze (default: 30d)"),
    detailed: z.boolean().optional().describe("Include namespace activity, project breakdown, and top tools (default: false)"),
  },
  async ({ period, detailed }) => {
    try {
      const stats = computeStats(parsePeriodDays(period));

      if (stats.totalCalls === 0) {
        return textResponse("No telemetry data yet. Usage will be tracked automatically as MCP tools are called.");
      }

      const lines: string[] = [];
      lines.push(`CodexCLI Usage Stats (${stats.period === 'all' ? 'all time' : `last ${stats.period}`})`);
      lines.push('');
      lines.push(`MCP sessions:    ${stats.mcpSessions}`);
      lines.push(`MCP calls:       ${stats.mcpCalls}`);
      if (stats.mcpSessions > 0) {
        lines.push(`  Bootstrap rate:  ${(stats.bootstrapRate * 100).toFixed(0)}% of sessions call codex_context first`);
        lines.push(`  Write-back rate: ${(stats.writeBackRate * 100).toFixed(0)}% of sessions store at least 1 entry`);
      }
      lines.push(`CLI calls:       ${stats.cliCalls}`);
      lines.push(`Total calls:     ${stats.totalCalls}`);
      lines.push(`Read:write:      ${stats.readWriteRatio} (${stats.reads} reads, ${stats.writes} writes, ${stats.execs} execs)`);

      const { project, global: glob, unscoped } = stats.scopeBreakdown;
      if (project > 0 || glob > 0) {
        const parts = [];
        if (project > 0) parts.push(`${project} project`);
        if (glob > 0) parts.push(`${glob} global`);
        if (unscoped > 0) parts.push(`${unscoped} unscoped`);
        lines.push(`Scope:           ${parts.join(', ')}`);
      }

      if (detailed && Object.keys(stats.namespaceCoverage).length > 0) {
        lines.push('');
        lines.push('Namespace activity:');
        const sorted = Object.entries(stats.namespaceCoverage)
          .sort(([, a], [, b]) => (b.reads + b.writes) - (a.reads + a.writes));
        for (const [ns, data] of sorted) {
          const age = data.lastWrite ? `${Math.floor((Date.now() - data.lastWrite) / 86400000)}d ago` : 'never';
          lines.push(`  ${ns.padEnd(20)} ${String(data.reads).padStart(3)} reads  ${String(data.writes).padStart(3)} writes  last write: ${age}`);
        }
      }

      // Project breakdown
      if (detailed) {
        const projects = Object.entries(stats.projectBreakdown);
        if (projects.length > 0) {
          lines.push('');
          lines.push('Project activity:');
          const sortedProjects = projects.sort(([, a], [, b]) => b - a);
          for (const [proj, count] of sortedProjects) {
            const label = proj.split('/').slice(-2).join('/');  // last 2 path segments
            lines.push(`  ${label.padEnd(30)} ${count} calls`);
          }
        }
      }

      // Session metrics
      if (stats.avgSessionCalls !== undefined || stats.avgSessionDurationMs !== undefined) {
        lines.push('');
        lines.push('Session metrics:');
        if (stats.avgSessionCalls !== undefined)
          lines.push(`  Avg calls/session: ${stats.avgSessionCalls.toFixed(1)}`);
        if (stats.avgSessionDurationMs !== undefined) {
          const secs = stats.avgSessionDurationMs / 1000;
          const label = secs < 60 ? `${secs.toFixed(1)}s` : `${(secs / 60).toFixed(1)}m`;
          lines.push(`  Avg session duration: ${label}`);
        }
      }

      // Token efficiency
      const hasEfficiency = stats.hitRate !== undefined || stats.redundantRate !== undefined || stats.totalResponseBytes > 0 || stats.avgDurationMs !== undefined;
      if (hasEfficiency) {
        lines.push('');
        lines.push('Token efficiency:');
        if (stats.hitRate !== undefined)
          lines.push(`  Hit rate:          ${(stats.hitRate * 100).toFixed(0)}% (${stats.hits} hits, ${stats.misses} misses)`);
        if (stats.redundantRate !== undefined && stats.writes > 0)
          lines.push(`  Redundant writes:  ${(stats.redundantRate * 100).toFixed(0)}% (${stats.redundantWrites} of ${stats.writes})`);
        if (stats.totalResponseBytes > 0) {
          const kb = stats.totalResponseBytes / 1024;
          lines.push(`  Response bytes:    ${kb >= 1 ? `${kb.toFixed(1)}KB` : `${stats.totalResponseBytes}B`} total${stats.avgResponseBytes !== undefined ? `, ${Math.round(stats.avgResponseBytes)}B avg` : ''}`);
        }
        if (stats.avgDurationMs !== undefined)
          lines.push(`  Avg latency:       ${Math.round(stats.avgDurationMs)}ms`);
        if (stats.estimatedTokensSaved > 0) {
          const fmt = stats.estimatedTokensSaved >= 1000 ? `${(stats.estimatedTokensSaved / 1000).toFixed(1)}K` : String(stats.estimatedTokensSaved);
          lines.push(`  Est. tokens saved: ~${fmt} via cache hits`);
          if (stats.estimatedTokensSavedBootstrap > 0) {
            const bFmt = stats.estimatedTokensSavedBootstrap >= 1000 ? `${(stats.estimatedTokensSavedBootstrap / 1000).toFixed(1)}K` : String(stats.estimatedTokensSavedBootstrap);
            lines.push(`    via bootstrap:   ~${bFmt}`);
          }
        }
      }

      const agents = Object.entries(stats.agentBreakdown);
      if (detailed && agents.length > 0) {
        lines.push('');
        lines.push('Agent activity:');
        for (const [agent, data] of agents.sort(([,a],[,b]) => b.calls - a.calls)) {
          lines.push(`  ${agent.padEnd(24)} ${data.calls} calls (${data.reads}R ${data.writes}W)`);
        }
      }

      if (detailed && stats.topTools.length > 0) {
        lines.push('');
        lines.push('Top tools:');
        for (const { tool, count } of stats.topTools) {
          lines.push(`  ${tool.padEnd(24)} ${count} calls`);
        }
      }

      // Trend comparison
      if (stats.trend) {
        const t = stats.trend;
        const fmtDelta = (v: number | undefined, suffix = '%') => {
          if (v === undefined) return undefined;
          const sign = v >= 0 ? '+' : '';
          return `${sign}${v.toFixed(0)}${suffix}`;
        };
        const trendParts: string[] = [];
        const cd = fmtDelta(t.callsDelta);
        if (cd) trendParts.push(`calls ${cd}`);
        const sd = fmtDelta(t.sessionsDelta);
        if (sd) trendParts.push(`sessions ${sd}`);
        const hd = fmtDelta(t.hitRateDelta, 'pp');
        if (hd) trendParts.push(`hit rate ${hd}`);
        const dd = fmtDelta(t.avgDurationDelta);
        if (dd) trendParts.push(`latency ${dd}`);
        if (trendParts.length > 0) {
          lines.push('');
          lines.push(`Trend (vs prev ${stats.period}): ${trendParts.join(', ')}`);
        }
      }

      return textResponse(lines.join('\n'));
    } catch (err) {
      return errorResponse(`Error computing stats: ${String(err)}`);
    }
  }
);

// --- codex_audit ---
server.tool(
  "codex_audit",
  "Query the audit log of data mutations and operations",
  {
    key: z.string().optional().describe("Filter by exact key or key prefix"),
    period: z.enum(["7d", "30d", "90d", "all"]).optional().describe("Time period to query (default: 30d)"),
    writes_only: z.boolean().optional().describe("Show only write operations"),
    src: z.enum(["mcp", "cli"]).optional().describe("Filter by source: mcp or cli"),
    project: z.string().optional().describe("Filter by project directory path"),
    hits_only: z.boolean().optional().describe("Show only read operations that returned data (hits)"),
    misses_only: z.boolean().optional().describe("Show only read operations that found nothing (misses)"),
    redundant_only: z.boolean().optional().describe("Show only writes where value didn't change"),
    detailed: z.boolean().optional().describe("Show per-entry metrics (duration, sizes, hit/miss) (default: false)"),
    limit: z.number().int().min(1).max(500).optional().describe("Max entries to return (default: 50)"),
  },
  async ({ key, period, writes_only, src, project, hits_only, misses_only, redundant_only, detailed, limit }) => {
    try {
      const entries = queryAuditLog({ key, periodDays: parsePeriodDays(period), writesOnly: writes_only, src, project, hitsOnly: hits_only, missesOnly: misses_only, redundantOnly: redundant_only, limit: limit ?? 50 });

      if (entries.length === 0) {
        return textResponse("No audit entries found.");
      }

      const lines: string[] = [];
      lines.push(`Audit Log (${entries.length} entries)\n`);

      for (const e of entries) {
        const time = new Date(e.ts).toISOString().replace('T', ' ').slice(0, 19);
        const status = e.success ? 'OK' : 'FAIL';
        const keyStr = e.key ?? '(bulk)';
        const parts = [`${time}  ${e.src}  ${e.tool.padEnd(20)}  ${keyStr}  [${e.scope ?? 'auto'}]  ${status}`];
        if (e.project) parts[0] += `  project=${e.project}`;
        if (e.agent) parts[0] += `  agent=${e.agent}`;
        lines.push(parts[0]);

        if (e.before !== undefined) lines.push(`  - ${e.before}`);
        if (e.after !== undefined) lines.push(`  + ${e.after}`);
        if (e.error) lines.push(`  error: ${e.error}`);

        // Metrics tags (detailed only)
        if (detailed) {
          const tags: string[] = [];
          if (e.duration !== undefined) tags.push(`${e.duration}ms`);
          if (e.aliasResolved) tags.push(`alias->${e.aliasResolved}`);
          if (e.responseSize !== undefined) tags.push(`res=${e.responseSize}B`);
          if (e.requestSize !== undefined) tags.push(`req=${e.requestSize}B`);
          if (e.hit !== undefined) tags.push(e.hit ? 'hit' : 'miss');
          if (e.tier !== undefined) tags.push(`tier=${e.tier}`);
          if (e.entryCount !== undefined) tags.push(`n=${e.entryCount}`);
          if (e.redundant) tags.push('redundant');
          if (tags.length > 0) lines.push(`  [${tags.join(', ')}]`);
        }
      }

      return textResponse(lines.join('\n'));
    } catch (err) {
      return errorResponse(`Error querying audit log: ${String(err)}`);
    }
  }
);

// --- Start server ---
export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Auto-start when run directly (e.g. `node dist/mcp-server.js` or `cclid-mcp`)
// When imported by index.ts for the `mcp-server` subcommand, the caller invokes startMcpServer() explicitly.
if (process.argv[1] && (process.argv[1].endsWith('mcp-server.js') || process.argv[1].endsWith('cclid-mcp'))) {
  // Support CODEX_PROJECT_DIR env var or --cwd flag for project-scoped data detection
  const projectDir = process.env.CODEX_PROJECT_DIR
    ?? (process.argv.includes('--cwd') ? process.argv[process.argv.indexOf('--cwd') + 1] : undefined);
  if (projectDir) {
    process.chdir(projectDir);
  }
  startMcpServer().catch((err) => {
    process.stderr.write(`MCP server error: ${err}\n`);
    process.exit(1);
  });
}
