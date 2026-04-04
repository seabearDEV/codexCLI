import { getValue } from './storage';

export const DEFAULT_LLM_INSTRUCTIONS = `You are connected to a CodexCLI data store via MCP. This store is a persistent, structured knowledge base for the project you are working on. Use it to learn, record, and share context across sessions and AI agents.

HOW TO USE:
- At session start, call codex_context to load all stored project knowledge in one call.
- Before exploring the codebase (reading files, searching code), check if the answer is already stored — e.g. codex_get with key "arch" or "conventions" or "commands".
- When you discover something non-obvious about the project (architecture decisions, gotchas, patterns, key file roles), store it with codex_set.
- When you find stored information that is outdated or wrong, update it immediately.
- Do NOT store things easily derived from package.json, README, or the code itself. Store insights, decisions, and context that would otherwise be lost between sessions.

SCHEMA (recommended namespaces):
- project.*      — name, description, stack, repo URL
- commands.*     — build, test, lint, deploy commands
- arch.*         — architecture notes, patterns, key decisions
- conventions.*  — coding patterns, naming rules, style notes
- context.*      — non-obvious gotchas, edge cases, historical decisions
- files.*        — key file paths and their roles
- deps.*         — notable dependencies and why they are used

SCOPE:
- If a .codexcli.json project file exists, reads/writes default to the project scope.
- Use scope: "global" to target the user's personal global store (~/.codexcli/data.json).
- codex_get with no key shows project entries by default. Pass all: true to see both scopes.

TOOL TIPS:
- codex_context — compact summary of all entries (best for session start)
- codex_get — retrieve specific keys or browse namespaces (use depth: 1 to scan top-level)
- codex_set — store a key-value pair (use dot notation, keep values concise)
- codex_search — find entries by keyword
- codex_run — execute a stored shell command (respects confirm metadata)
- codex_stats — view your usage metrics (bootstrap rate, write-back rate, trends)

EFFECTIVE USAGE:
- Always call codex_context as your FIRST tool call to bootstrap session knowledge.
- Write back: when you learn something non-obvious, store it before the session ends.
- Usage is tracked — codex_stats shows how effectively the knowledge base is being used.`;

/**
 * Get the custom LLM instructions from the data store, if any.
 * Returns undefined if not set.
 */
export function getCustomInstructions(): string | undefined {
  try {
    const val = getValue('system.llm.instructions');
    return typeof val === 'string' ? val : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Assemble the effective LLM instructions: built-in defaults + optional custom section.
 * Custom instructions are appended as a PROJECT CONTEXT block, not a replacement.
 */
export function getEffectiveInstructions(): string {
  const custom = getCustomInstructions();
  if (!custom) return DEFAULT_LLM_INSTRUCTIONS;
  return `${DEFAULT_LLM_INSTRUCTIONS}\n\nPROJECT CONTEXT:\n${custom}`;
}
