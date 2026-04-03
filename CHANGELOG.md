# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.7.0] - 2026-04-02

### Added

- **`ccli init`** — top-level command to create/remove project-scoped `.codexcli.json` (replaces `ccli data projectfile`).
- **`--all` / `-A` flag on `get`** — shows entries from both project and global scopes with section headers.
- MCP `codex_get`: `all` parameter for listing both scopes.

### Changed

- **`ccli get` now shows project entries only** when inside a project directory. Previously showed merged project + global entries with `[P]` markers. Use `-G` for global only, `-A` for both.
- Single-key lookups (`ccli get specific.key`) still fall through project → global transparently.
- `ccli data projectfile` is now a hidden alias for `ccli init`.
- Removed `[P]` prefix markers from listing output.

## [0.6.1] - 2026-04-02

### Added

- **`mcp-server --cwd <dir>`** — set the working directory for the MCP server so it detects project-scoped `.codexcli.json` files. Pass this when registering the server (e.g., `claude mcp add codexcli -- ccli mcp-server --cwd /path/to/project`).
- Updated default LLM instructions to guide AI agents on using project vs. global scope.

## [0.6.0] - 2026-04-02

### Added

- **Project-scoped data** — `ccli data projectfile` creates a `.codexcli.json` in the current directory. Project entries take precedence on reads, with automatic fallthrough to global data. Use `ccli data projectfile --remove` to delete.
- **`--global` / `-G` flag** on `set`, `get`, `run`, `find`, `copy`, `edit`, `rename`, `remove` — explicitly target the global data store when a project file exists.
- **`--global` / `-G` and `--project` / `-P` flags** on `data export`, `data import`, `data reset` — scope data management operations to a specific store.
- **MCP `scope` parameter** — all data-touching MCP tools (`codex_set`, `codex_get`, `codex_remove`, `codex_copy`, `codex_search`, `codex_run`, `codex_alias_*`, `codex_export`, `codex_import`, `codex_reset`) accept optional `scope: "project" | "global"`.
- Tab completion for `data projectfile` subcommand and `--global` / `-G` flags on all data commands.
- `config info` now shows project file path (or "none") alongside the unified data file path.

### Changed

- **Unified data file** — entries, aliases, and confirm metadata are now stored in a single `data.json` (format: `{ entries, aliases, confirm }`). Existing separate files (`entries.json`, `aliases.json`, `confirm.json`) are auto-migrated on first access and backed up as `.backup`.
- `config info` now shows a single "Data" path instead of separate Entries/Aliases/Confirm paths.

## [0.5.1] - 2026-03-24

### Added

- **MCP server LLM instructions** — the MCP server now sends instructions to connected AI agents on initialization, guiding default behavior (e.g., prefer reads over writes). Built-in defaults work out of the box; users can override by setting `system.llm.instructions`.

## [0.5.0] - 2026-03-24

### Added

- **`--depth` / `-k <n>` flag on `get`** — limit key depth for progressive browsing (e.g., `-k 1` for top-level namespaces, `-k 2` for two levels). Works in both flat and tree modes.
- MCP `codex_get` tool: added `depth` parameter for depth-limited key listing

### Changed

- **`get` default output is now keys-only** — `ccli get` now lists keys without values, reducing noise as the data store grows. Use `-v` / `--values` to include values. Leaf values (e.g., `ccli get server.ip`) always show their value.
- MCP `codex_get` tool: added `values` parameter (default `false`; leaf values always include their value)

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
