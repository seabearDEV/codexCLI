## Bootstrap

Call `codex_context` as your first tool call to load all stored project knowledge.

## Prefer MCP tools over direct file reads

Always use codexCLI MCP tools (`codex_get`, `codex_set`, `codex_search`, etc.) to interact with `.codexcli.json`. Direct file reads bypass audit logging, alias resolution, and interpolation. The only acceptable reason to read `.codexcli.json` directly is debugging the MCP server itself.

## Before exploring code

- Check `codex_get` with key `files.<name>` before globbing/grepping for a source file.
- Check `codex_get` with key `arch.<area>` before reading code to understand a subsystem.
- Check `codex_get` with key `conventions.<topic>` before making style/pattern decisions.

## Write back

When you discover something non-obvious (a gotcha, an architectural decision, a pattern), store it with `codex_set` before the session ends. Future sessions benefit from what you learn now.

## Do not store

Things derivable from `package.json`, `README.md`, or the code itself. The codex is for insights that would otherwise be lost between sessions.
