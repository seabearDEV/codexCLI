#!/usr/bin/env node
/* eslint-disable @typescript-eslint/require-await */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { execSync } from "child_process";

import { loadData, saveData, getValue, setValue, removeValue, getEntriesFlat } from "./storage";
import { CodexData } from "./types";
import {
  flattenObject,
} from "./utils/objectPath";
import {
  loadAliases,
  saveAliases,
  resolveKey,
  buildKeyToAliasMap,
  removeAliasesForKey,
} from "./alias";
import {
  ensureDataDirectoryExists,
} from "./utils/paths";
import { hasConfirm, loadConfirmKeys, saveConfirmKeys } from "./confirm";
import { loadConfig, getConfigSetting, setConfigSetting, VALID_CONFIG_KEYS } from "./config";
import { deepMerge } from "./utils/deepMerge";
import { version } from "../package.json";
import { formatTree } from "./formatting";
import { isEncrypted, maskEncryptedValues, encryptValue, decryptValue } from "./utils/crypto";
import { interpolate, interpolateObject } from "./utils/interpolate";

function textResponse(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function errorResponse(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const server = new McpServer({
  name: "codexcli",
  version,
});

// --- codex_set ---
server.tool(
  "codex_set",
  "Set an entry in the CodexCLI data store",
  { key: z.string().describe("Dot-notation key (e.g. server.prod.ip)"), value: z.string().describe("Value to store"), alias: z.string().optional().describe("Create an alias for this key"), encrypt: z.boolean().optional().describe("Encrypt the value with the provided password"), password: z.string().optional().describe("Password for encryption (required when encrypt is true)") },
  async ({ key, value, alias, encrypt, password }) => {
    try {
      ensureDataDirectoryExists();
      const resolved = resolveKey(key);
      let storedValue = value;
      if (encrypt) {
        if (!password) {
          return errorResponse("Password is required when encrypt is true.");
        }
        storedValue = encryptValue(value, password);
      }
      setValue(resolved, storedValue);
      if (alias) {
        const aliases = loadAliases();
        // Enforce one alias per entry: remove any existing alias for the same target
        for (const [existingAlias, target] of Object.entries(aliases)) {
          if (target === resolved && existingAlias !== alias) {
            delete aliases[existingAlias];
          }
        }
        aliases[alias] = resolved;
        saveAliases(aliases);
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
  "Retrieve entries from the CodexCLI data store",
  {
    key: z.string().optional().describe("Dot-notation key to retrieve (omit for all entries)"),
    format: z.enum(["flat", "tree"]).optional().describe("Output format: flat (default) or tree"),
    aliases_only: z.boolean().optional().describe("Show aliases only"),
    decrypt: z.boolean().optional().describe("Decrypt an encrypted value"),
    password: z.string().optional().describe("Password for decryption (required when decrypt is true)"),
  },
  async ({ key, format, aliases_only, decrypt: decryptOpt, password }) => {
    try {
      const data = loadData();
      const keyToAliasMap = buildKeyToAliasMap();

      // No key — return entries and/or aliases
      if (!key) {
        // Aliases only
        if (aliases_only) {
          const aliases = loadAliases();
          const entries = Object.entries(aliases);
          if (entries.length === 0) {
            return textResponse("No aliases defined.");
          }
          const lines = entries.map(([a, t]) => `${a} -> ${t}`);
          return textResponse(lines.join("\n"));
        }

        const sections: string[] = [];

        // Entries
        if (Object.keys(data).length > 0) {
          if (format === "tree") {
            sections.push(formatTree(data, keyToAliasMap, '', '', false));
          } else {
            const flat = flattenObject(data);
            const lines = Object.entries(flat).map(([k, v]) => `${k}: ${isEncrypted(v) ? '[encrypted]' : v}`);
            sections.push(lines.join("\n"));
          }
        } else {
          sections.push("No entries found.");
        }

        return textResponse(sections.join("\n"));
      }

      // Resolve potential alias
      const resolvedKey = resolveKey(key);
      const value = getValue(resolvedKey);

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

      // Object subtree — interpolate leaf values
      if (format === "tree") {
        return textResponse(formatTree(value, keyToAliasMap, '', resolvedKey, false));
      }
      const flat = flattenObject(value, resolvedKey);
      const interpFlat = interpolateObject(flat as Record<string, import("./types").CodexValue>);
      const lines = Object.entries(interpFlat).map(([k, v]) => {
        const strVal = typeof v === 'string' ? v : JSON.stringify(v);
        return `${k}: ${isEncrypted(strVal) ? '[encrypted]' : strVal}`;
      });
      return textResponse(lines.join("\n"));
    } catch (err) {
      return errorResponse(`Error retrieving entry: ${String(err)}`);
    }
  }
);

// --- codex_remove ---
server.tool(
  "codex_remove",
  "Remove an entry from the CodexCLI data store",
  {
    key: z.string().describe("Dot-notation key to remove"),
    is_alias: z.boolean().optional().describe("If true, remove the alias only (keep the entry)"),
  },
  async ({ key, is_alias }) => {
    try {
      if (is_alias) {
        const aliases = loadAliases();
        if (!(key in aliases)) {
          return errorResponse(`Alias '${key}' not found.`);
        }
        delete aliases[key];
        saveAliases(aliases);
        return textResponse(`Alias removed: ${key}`);
      }

      const resolvedKey = resolveKey(key);
      const removed = removeValue(resolvedKey);
      if (!removed) {
        return errorResponse(`Key '${key}' not found.`);
      }
      // Cascade delete: remove any aliases pointing to this key or its children
      removeAliasesForKey(resolvedKey);
      return textResponse(`Removed: ${resolvedKey}`);
    } catch (err) {
      return errorResponse(`Error removing entry: ${String(err)}`);
    }
  }
);

// --- codex_search ---
server.tool(
  "codex_search",
  "Search entries in the CodexCLI data store",
  {
    searchTerm: z.string().describe("Term to search for (case-insensitive)"),
    aliasesOnly: z.boolean().optional().describe("Search only in aliases"),
    entriesOnly: z.boolean().optional().describe("Search only in data entries"),
  },
  async ({ searchTerm, aliasesOnly, entriesOnly }) => {
    try {
      const term = searchTerm.toLowerCase();
      const results: string[] = [];

      if (!aliasesOnly) {

        const flat = getEntriesFlat();
        for (const [k, v] of Object.entries(flat)) {
          const encrypted = isEncrypted(v);
          const keyMatch = k.toLowerCase().includes(term);
          const valueMatch = !encrypted && String(v).toLowerCase().includes(term);

          if (keyMatch || valueMatch) {
            results.push(`${k}: ${encrypted ? '[encrypted]' : v}`);
          }
        }
      }

      if (!entriesOnly) {
        const aliases = loadAliases();
        for (const [alias, target] of Object.entries(aliases)) {
          if (
            alias.toLowerCase().includes(term) ||
            target.toLowerCase().includes(term)
          ) {
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
  },
  async ({ alias, path }) => {
    try {
      const aliases = loadAliases();
      // Enforce one alias per entry: remove any existing alias for the same target
      for (const [existingAlias, target] of Object.entries(aliases)) {
        if (target === path && existingAlias !== alias) {
          delete aliases[existingAlias];
        }
      }
      aliases[alias] = path;
      saveAliases(aliases);
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
  { alias: z.string().describe("Alias name to remove") },
  async ({ alias }) => {
    try {
      const aliases = loadAliases();
      if (!(alias in aliases)) {
        return errorResponse(`Alias '${alias}' not found.`);
      }
      delete aliases[alias];
      saveAliases(aliases);
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
  {},
  async () => {
    try {
      const aliases = loadAliases();
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
  "Execute a stored command from the data store",
  {
    key: z.string().describe("Dot-notation key (or alias) whose value is a shell command"),
    dry: z.boolean().optional().describe("If true, return the command without executing it"),
    force: z.boolean().optional().describe("If true, skip the confirm check for entries marked --confirm"),
  },
  async ({ key, dry, force }) => {
    const resolvedKey = resolveKey(key);
    const value = getValue(resolvedKey);

    if (value === undefined) {
      return errorResponse(`Key '${key}' not found.`);
    }
    if (typeof value !== "string") {
      return errorResponse(`Value at '${key}' is not a string command.`);
    }

    if (isEncrypted(value)) {
      return errorResponse(`Value at '${key}' is encrypted. Decryption is not supported via MCP.`);
    }

    // Respect confirm metadata: refuse unless --force or --dry
    if (hasConfirm(resolvedKey) && !force && !dry) {
      return errorResponse(
        `Entry '${key}' requires confirmation (--confirm). Pass force: true to execute.`
      );
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
  },
  async ({ type, pretty }) => {
    try {
      const indent = pretty ? 2 : 0;

      if (type === "all") {
        const combined = { entries: maskEncryptedValues(loadData()), aliases: loadAliases(), confirm: loadConfirmKeys() };
        return textResponse(JSON.stringify(combined, null, indent));
      }

      if (type === "confirm") {
        return textResponse(JSON.stringify(loadConfirmKeys(), null, indent));
      }

      const content = type === "entries" ? maskEncryptedValues(loadData()) : loadAliases();
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
  },
  async ({ type, json, merge }) => {
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

        const currentData = merge ? loadData() : {};
        saveData((merge ? deepMerge(currentData, dataObj) : dataObj) as CodexData);

        const currentAliases = merge ? loadAliases() : {};
        saveAliases(merge ? { ...currentAliases, ...(aliasesObj as Record<string, string>) } : aliasesObj as Record<string, string>);

        // Import confirm keys if present; reset to empty when replacing and key is absent
        const confirmVal = obj.confirm;
        if (confirmVal && typeof confirmVal === "object" && !Array.isArray(confirmVal)) {
          const currentConfirm = merge ? loadConfirmKeys() : {};
          saveConfirmKeys(merge ? { ...currentConfirm, ...(confirmVal as Record<string, true>) } : confirmVal as Record<string, true>);
        } else if (!merge) {
          saveConfirmKeys({});
        }
      } else if (type === "entries") {
        const current = merge ? loadData() : {};
        const newData = merge ? deepMerge(current, obj) : obj;
        saveData(newData as CodexData);
      } else if (type === "confirm") {
        const currentConfirm = merge ? loadConfirmKeys() : {};
        const newConfirm = merge ? { ...currentConfirm, ...(obj as Record<string, true>) } : obj;
        saveConfirmKeys(newConfirm as Record<string, true>);
      } else {
        if (Object.values(obj).some(v => typeof v !== "string")) {
          return errorResponse("Alias values must all be strings (dot-notation paths).");
        }

        const current = merge ? loadAliases() : {};
        const newAliases = merge
          ? { ...current, ...(obj as Record<string, string>) }
          : obj;
        saveAliases(newAliases as Record<string, string>);
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
  "Reset entries and/or aliases to empty state",
  {
    type: z.enum(["entries", "aliases", "confirm", "all"]).describe("What to reset"),
  },
  async ({ type }) => {
    try {
      if (type === "entries" || type === "all") {
        saveData({});
      }
      if (type === "aliases" || type === "all") {
        saveAliases({});
      }
      if (type === "confirm" || type === "all") {
        saveConfirmKeys({});
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

// --- Start server ---
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP server error: ${err}\n`);
  process.exit(1);
});
