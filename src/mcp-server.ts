#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadData, saveData } from "./storage";
import {
  setNestedValue,
  getNestedValue,
  removeNestedValue,
  flattenObject,
} from "./utils/objectPath";
import {
  loadAliases,
  saveAliases,
  resolveKey,
  buildKeyToAliasMap,
} from "./alias";
import { ensureDataDirectoryExists } from "./utils/paths";

/**
 * Pure function that mirrors displayTree() from formatting.ts
 * but returns a string instead of calling console.log().
 */
function formatAsTree(
  data: object,
  keyToAliasMap: Record<string, string[]> = {},
  prefix = "",
  path = ""
): string {
  const lines: string[] = [];
  const entries = Object.entries(data);

  entries.forEach(([key, value], index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    const fullPrefix = prefix + connector;
    const fullPath = path ? `${path}.${key}` : key;

    const aliases = keyToAliasMap[fullPath];
    const aliasDisplay =
      aliases && aliases.length > 0 ? ` (${aliases[0]})` : "";

    if (typeof value === "object" && value !== null) {
      lines.push(`${fullPrefix}${key}${aliasDisplay}`);
      const childPrefix = prefix + (isLast ? "    " : "\u2502   ");
      lines.push(formatAsTree(value, keyToAliasMap, childPrefix, fullPath));
    } else {
      lines.push(`${fullPrefix}${key}${aliasDisplay}: ${value}`);
    }
  });

  return lines.filter((l) => l.length > 0).join("\n");
}

const server = new McpServer({
  name: "codexcli",
  version: "1.1.1",
});

// --- codex_add ---
server.tool(
  "codex_add",
  "Add or update an entry in the CodexCLI data store",
  { key: z.string().describe("Dot-notation key (e.g. server.prod.ip)"), value: z.string().describe("Value to store") },
  async ({ key, value }) => {
    try {
      ensureDataDirectoryExists();
      const data = loadData();
      setNestedValue(data, key, value);
      saveData(data);
      return { content: [{ type: "text" as const, text: `Added: ${key} = ${value}` }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error adding entry: ${err}` }], isError: true };
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
  },
  async ({ key, format }) => {
    try {
      const data = loadData();
      const keyToAliasMap = buildKeyToAliasMap();

      // No key — return all entries
      if (!key) {
        if (Object.keys(data).length === 0) {
          return { content: [{ type: "text" as const, text: "No entries found." }] };
        }
        if (format === "tree") {
          return { content: [{ type: "text" as const, text: formatAsTree(data, keyToAliasMap) }] };
        }
        const flat = flattenObject(data);
        const lines = Object.entries(flat).map(([k, v]) => `${k}: ${v}`);
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      // Resolve potential alias
      const resolvedKey = resolveKey(key);
      const value = getNestedValue(data, resolvedKey);

      if (value === undefined) {
        return { content: [{ type: "text" as const, text: `Key '${key}' not found.` }], isError: true };
      }

      // Leaf value
      if (typeof value !== "object" || value === null) {
        return { content: [{ type: "text" as const, text: `${resolvedKey}: ${value}` }] };
      }

      // Object subtree
      if (format === "tree") {
        return { content: [{ type: "text" as const, text: formatAsTree(value, keyToAliasMap, "", resolvedKey) }] };
      }
      const flat = flattenObject(value, resolvedKey);
      const lines = Object.entries(flat).map(([k, v]) => `${k}: ${v}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error retrieving entry: ${err}` }], isError: true };
    }
  }
);

// --- codex_remove ---
server.tool(
  "codex_remove",
  "Remove an entry from the CodexCLI data store",
  { key: z.string().describe("Dot-notation key to remove") },
  async ({ key }) => {
    try {
      const resolvedKey = resolveKey(key);
      const data = loadData();
      const removed = removeNestedValue(data, resolvedKey);
      if (!removed) {
        return { content: [{ type: "text" as const, text: `Key '${key}' not found.` }], isError: true };
      }
      saveData(data);
      return { content: [{ type: "text" as const, text: `Removed: ${resolvedKey}` }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error removing entry: ${err}` }], isError: true };
    }
  }
);

// --- codex_search ---
server.tool(
  "codex_search",
  "Search entries in the CodexCLI data store",
  {
    searchTerm: z.string().describe("Term to search for (case-insensitive)"),
    keysOnly: z.boolean().optional().describe("Search only in keys"),
    valuesOnly: z.boolean().optional().describe("Search only in values"),
    aliasesOnly: z.boolean().optional().describe("Search only in aliases"),
  },
  async ({ searchTerm, keysOnly, valuesOnly, aliasesOnly }) => {
    try {
      const term = searchTerm.toLowerCase();
      const results: string[] = [];

      if (!aliasesOnly) {
        const flat = flattenObject(loadData());
        for (const [k, v] of Object.entries(flat)) {
          const keyMatch = k.toLowerCase().includes(term);
          const valueMatch = String(v).toLowerCase().includes(term);

          if (keysOnly && keyMatch) {
            results.push(`${k}: ${v}`);
          } else if (valuesOnly && valueMatch) {
            results.push(`${k}: ${v}`);
          } else if (!keysOnly && !valuesOnly && (keyMatch || valueMatch)) {
            results.push(`${k}: ${v}`);
          }
        }
      }

      if (!keysOnly && !valuesOnly) {
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
        return { content: [{ type: "text" as const, text: `No results found for '${searchTerm}'.` }] };
      }
      return { content: [{ type: "text" as const, text: results.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error searching: ${err}` }], isError: true };
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
      aliases[alias] = path;
      saveAliases(aliases);
      return { content: [{ type: "text" as const, text: `Alias set: ${alias} -> ${path}` }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error setting alias: ${err}` }], isError: true };
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
      if (!aliases.hasOwnProperty(alias)) {
        return { content: [{ type: "text" as const, text: `Alias '${alias}' not found.` }], isError: true };
      }
      delete aliases[alias];
      saveAliases(aliases);
      return { content: [{ type: "text" as const, text: `Alias removed: ${alias}` }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error removing alias: ${err}` }], isError: true };
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
        return { content: [{ type: "text" as const, text: "No aliases defined." }] };
      }
      const lines = entries.map(([a, t]) => `${a} -> ${t}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error listing aliases: ${err}` }], isError: true };
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
