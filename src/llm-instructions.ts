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
- codex_context — compact summary of entries (best for session start). Accepts tier: "essential" (minimal), "standard" (default, excludes arch), "full" (everything)
- codex_get — retrieve specific keys or browse namespaces (use depth: 1 to scan top-level)
- codex_set — store a key-value pair (use dot notation, keep values concise)
- codex_search — find entries by keyword
- codex_run — execute a stored shell command. If the command requires confirmation, the response will include a one-time confirm_token. Show the command to the user, get approval, then call codex_run again with that confirm_token to execute.
- codex_stats — view usage metrics and token efficiency (bootstrap rate, hit rate, token savings, per-agent breakdown, trends). Pass detailed: true for namespace activity and top tools.
- codex_audit — query the audit log of data mutations and reads (before/after diffs, agent identity, hit/miss tracking). Pass detailed: true for per-entry latency, response sizes, and redundancy flags.

PREFER MCP TOOLS:
- Always interact with the data store via MCP tools (codex_get, codex_set, codex_search, etc.) rather than reading .codexcli.json directly.
- Direct file reads bypass audit logging, alias resolution, interpolation, and scope fallthrough.
- The only reason to read .codexcli.json directly is debugging the MCP server itself.

EFFECTIVE USAGE:
- Always call codex_context as your FIRST tool call to bootstrap session knowledge.
- Pick the right tier for the task:
  - tier:"essential" — answering questions, small fixes, single-file edits
  - omit (standard) — multi-file changes, bug fixes, new features
  - tier:"full" — refactoring subsystems, changing architecture, onboarding to the codebase
- Write back: when you learn something non-obvious, store it before the session ends.
- All mutations are audited — codex_audit shows what changed, when, and by whom.`;

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
