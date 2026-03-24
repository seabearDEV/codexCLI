# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-03-24

### Changed

- **`get` default output is now keys-only** — `ccli get` (with no key) now lists keys without values, reducing noise as the data store grows. Use `-v` / `--values` to include values. When a specific key is provided (e.g., `ccli get server`), values are always shown.
- MCP `codex_get` tool: added `values` parameter (default `false` when no key specified, `true` when a key is provided)

### Fixed

- Prototype-polluting function in nested object helpers (code scanning alerts #1 and #2)

### Dependencies

- Bump hono from 4.12.0 to 4.12.7
- Bump @hono/node-server from 1.19.9 to 1.19.10
- Bump express-rate-limit from 8.2.1 to 8.3.0
- Bump flatted from 3.3.3 to 3.4.2
- Bump minimatch from 10.2.2 to 10.2.4
- Bump rollup from 4.57.1 to 4.59.0

## [0.3.0] - 2026-02-23

### Added

- **Exec interpolation `$(key)`** — reference a stored command with `$(key)` and its stdout is substituted at read time. Works in `get`, `run`, and tree display. Results are cached per interpolation pass so the same command only executes once.
  - Supports recursion: stored commands can themselves contain `${key}` or `$(key)` references
  - Circular reference detection across `${}` and `$()` boundaries
  - 10-second timeout per command execution
  - `--source` / `-s` shows the raw `$(key)` syntax without executing
- Tab completion for `:` composition in `run` / `r` — e.g. `ccli r cd:paths.<TAB>` completes the segment after `:`
- Namespace prefixes in `get` / `g` tab completion — `ccli g paths<TAB>` now includes `paths` as a candidate so zsh stops at the namespace boundary instead of forcing `paths.`

### Fixed

- Zsh completion script: colons in completion values (from `:` composition) no longer break `_describe` parsing
- Bash completion script: colons no longer cause word splitting issues (removed `:` from `COMP_WORDBREAKS`)

## [0.2.1] - 2026-02-23

### Added

- `copy` command (alias `cp`) — copy an entry or subtree to a new key, with `--force` to skip confirmation
- `--capture` / `-c` flag on `run` — capture stdout for piping instead of inheriting stdio
- `--preview` / `-p` flag on `data import` — show a diff of add/modify/remove changes without modifying data
- Batch set with `key=val` pairs — e.g. `ccli set a=1 b=2 c=3`
- MCP `codex_copy` tool — copy entries via MCP with optional `force` to overwrite
- MCP `codex_import`: `preview` parameter to return diff text without importing
- MCP `codex_run`: `capture` parameter for API consistency (MCP already captures output)
- `--version` / `-V` now shown in main help under global options

### Changed

- Main help (`ccli --help`) now shows only commands, subcommands, and global options; per-command options moved to `<command> --help` submenus
- `set` command description updated to reflect batch mode support

### Fixed

- Nested subcommand `--help` routing — e.g. `ccli data import --help` now correctly shows import options instead of falling through to root help
- `edit` was missing from the tab-completion commands list

## [0.2.0] - 2026-02-21

### Added

- `edit` command (alias `e`) — open an entry's value in `$EDITOR` / `$VISUAL` with `--decrypt` support
- `--json` / `-j` flag on `get` and `find` for machine-readable JSON output
- Stdin piping for `set` — read value from stdin when piped (`echo "val" | ccli set key`)
- `confirm` as a standalone type for `data export`, `data import`, and `data reset`
- Advisory file locking (`fileLock.ts`) — all writes are lock-protected with stale-lock detection
- Auto-backup before destructive operations (`data reset`, non-merge `data import`) in `~/.codexcli/.backups/`
- MCP `codex_set`: `encrypt` and `password` parameters for encrypted storage
- MCP `codex_get`: `decrypt` and `password` parameters for encrypted retrieval
- MCP `codex_run`: `force` parameter to skip confirm check on protected entries
- MCP `codex_export`, `codex_import`, `codex_reset`: support for `confirm` data type
- Windows clipboard support via `clip` command
- `dev:watch` npm script — runs `tsc --watch` for automatic recompilation during development
- `lint` npm script with ESLint and `typescript-eslint` (type-checked + stylistic rulesets)

### Removed

- `start` npm script — redundant with `cclid`
- `dev` npm script — broken with path aliases and redundant with `cclid`
- `prepublish` npm script — not used (SEA distribution)

### Fixed

- `showExamples()` referenced non-existent flags `-k`, `-v`, `-e` — now uses valid flags
- `showHelp()` config signature and subcommands were incorrect — now shows `<subcommand>` with correct list
- `displayAliases` empty-state message referenced deleted command — now shows `set <key> <value> -a <alias>`
- `data export all -o <file>` overwrote the same file three times — filenames now suffixed with type
- MCP `codex_run` ignored `confirm` metadata — now checks confirm before executing
- Data files used default permissions (0644) — now use 0600; directories use 0700

## [0.1.0] - 2026-02-20

### Added

- Hierarchical data storage with dot notation paths
- Command runner with confirmation prompts and dry-run support
- Rich output formatting with color-coded output and tree visualization
- Alias system for frequently accessed paths
- Search with filtering by entries and aliases
- Configuration system (colors, themes)
- Data import/export (JSON format)
- Shell tab-completion for Bash and Zsh
- MCP server for AI agent integration (Claude Code, Claude Desktop)
- Interpolation with `${key}` syntax
- Value encryption with password protection
- Shell wrapper for running builtins in the current shell
- Clipboard integration
- Per-entry run confirmation (`--confirm` / `--no-confirm` flags, `confirm.json`)
- `rename` command for entry keys and aliases (`--set-alias` flag)
- `--force` flag on `remove` to skip confirmation prompt
- `--source` flag for `get` and `run` (show stored value before interpolation)
- `cachedStore` utility with mtime-based caching for aliases, confirm, and data stores
- First-run prompt to install shell completions and wrapper

### Changed

- Consolidated CLI from 13 top-level commands to 7 (`set`, `get`, `run`, `find`, `remove`, `config`, `data`)
- Moved `export`, `import`, `reset` under `data` subcommand
- Moved `info`, `examples`, `completions` under `config` subcommand
- `run` command now accepts variadic keys with `&&` chaining and `:` composition
- Removed `--prefix` and `--suffix` flags from `run`
- Aliases managed via `set -a`, `get -a`, `remove -a` instead of separate `alias` command
- Type-aware ESLint linting with `recommendedTypeChecked` and `stylisticTypeChecked` presets

### Removed

- `init` command (replaced by first-run welcome message)
- SQLite storage backend and `migrate` command
- `codex_init` MCP tool
