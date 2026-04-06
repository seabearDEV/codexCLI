# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.8.0] - 2026-04-06

### Added

- **`alias` subcommand group** — `alias set <name> <path>`, `alias remove <name>`, `alias list`, `alias rename <old> <new>`. Dedicated alias management replacing scattered `-a` flags.
- **`confirm` subcommand group** — `confirm set <key>`, `confirm remove <key>`, `confirm list`. Dedicated confirmation management replacing `set --confirm/--no-confirm`.
- **`context` command** — CLI equivalent of MCP `codex_context` with `--tier` filtering (essential, standard, full), `--json`, `--raw`.
- **`info` top-level command** — promoted from `config info`. Shows version, entry counts, storage paths.
- **`search` hidden alias** — `ccli search` works as an alias for `ccli find`, matching MCP `codex_search` naming.
- **Enhanced `ccli init`** — codebase scanner with 6 composable detectors (project, commands, files, deps, conventions, context) and ~50-entry known-deps lookup table. Generates `CLAUDE.md` with AI agent behavioral directives. Seeds `conventions.persistence` (three-file balance rule) and `context.initialized` (agent-driven analysis marker). Flags: `--no-scan`, `--no-claude`, `--force`, `--dry-run`.
- **Agent-driven first-session analysis** — LLM instructions and CLAUDE.md template include FIRST SESSION guidance. Agents detect fresh scaffold via `context.initialized` marker and automatically perform deep codebase analysis (populate `arch.*`, `context.*`, enriched `files.*`).
- **Centralized CLI instrumentation** — `withCliInstrumentation()` wrapper in `src/utils/instrumentation.ts`. All 22 CLI commands now have full telemetry + audit logging with parity to the MCP server wrapper.
- **Shared instrumentation helpers** — `SKIP_AUDIT`, `BULK_OPS`, `captureValue` extracted from MCP server and shared between CLI and MCP wrappers.
- **Knowledge Flywheel** section in README — explains how the knowledge base compounds across sessions and agents.
- **68 new tests** — `scan.test.ts` (44), `claude-md.test.ts` (11), `init.test.ts` (13), `context.test.ts` (6), `cli-restructure.test.ts` (19).

### Changed

- **CLI audit parity** — previously untracked commands now fully instrumented: `run`, `edit`, `alias list`, `alias rename`, `confirm set/remove/list`, `context`, `lint`, `config set/get`, `export`, `import`, `reset`, `init`.
- **`scaffoldProject()` refactored** — inline manifest parsing replaced with `scanCodebase()` from `src/commands/scan.ts`.
- **`filterEntriesByTier` extracted** — moved from `mcp-server.ts` to `src/commands/context.ts`, shared between MCP and CLI.
- **Help text updated** — new commands, subcommands, updated `find` description, completions table.
- **`init` description updated** — from "Create project-scoped .codexcli.json" to "Initialize project (.codexcli.json + CLAUDE.md)".

### Deprecated

- `get -a` — use `alias list` instead (prints notice, still works)
- `remove -a` — use `alias remove` instead
- `rename -a` — use `alias rename` instead
- `init --scaffold` — scanning is now the default (use `--no-scan` to skip)
- `data projectfile` — use `init` instead

## [1.7.0] - 2026-04-06

### Added

- **Staleness awareness in context/get** — `codex_context` and `codex_get` append `[untracked]` / `[Nd]` age tags to stale entries. CLI `get` prints yellow warning for stale entries.
- **Exploration-weighted token savings** — `codex_stats` estimates tokens saved per namespace using weighted exploration cost multipliers. Bootstrap estimation based on response size and entry count. Per-namespace breakdown in `--detailed` output.
- **`EXPLORATION_COST` map** — exported from telemetry.ts for transparency. Documents estimated exploration cost per namespace (files: 2000, arch: 3000, commands: 1000, etc.).
- **Comprehensive test suite expansion** — 633 → 1048 tests across 46 files. Includes concurrency stress tests, MCP integration with real I/O, property-based fuzz tests, store/storage layer tests, telemetry boundary cases.

## [1.6.0] - 2026-04-06

### Added

- **CLI audit enrichment** — CLI entries now include `duration`, `responseSize`, `hit`/`miss`, `redundant`, and `entryCount` metrics. `cclid audit --detailed` shows per-entry metrics for both CLI and MCP entries.
- **CLI read audit entries** — `get`, `find`/`search`, and `stale` commands now create audit entries with hit/miss tracking and entry counts.
- **Token savings estimate** — `codex_stats` and `cclid stats` now show estimated tokens saved via cache hits and bootstrap context reuse (~4 bytes/token).
- **Per-agent breakdown** — `CODEX_AGENT_NAME` is tracked in telemetry. `--detailed` stats show per-agent call/read/write counts.
- **Sync CLI logging** — `logAudit` and `logToolCall` accept `sync` flag for reliable CLI writes that survive process exit.
- **11 new computeStats tests** — hit rate, redundant rate, session duration, response bytes, trends, token savings, agent breakdown, edge cases.
- **2 new sync write tests** — verify `appendFileSync` path for CLI audit and telemetry.
- **`searchEntries` returns match counts** — enables hit/miss and entryCount tracking for search audit entries.

### Fixed

- **CLI audit/telemetry lost on process exit** — CLI used async `appendFile` but the process exited before callbacks fired. Now uses `appendFileSync` for all CLI calls.
- **Batch `set --global` wrote to wrong scope** — batch mode did not forward `options.global` to `setEntry`. Entries went to project scope instead of global.
- **Redundant writes marked as failures** — `success` check required `before !== after`, so same-value writes appeared as failures. Now uses `exitCode`-based success with separate `redundant` flag.
- **Batch set missing `redundant` flag** — only single-key set tracked redundancy. Batch path now detects and flags redundant writes.

## [1.5.1] - 2026-04-06

### Added

- **Two-step MCP confirmation** — `codex_run` for `--confirm` entries returns a one-time `confirm_token` (5min TTL) on first call. Pass token back to execute. `force:true` and `dry:true` bypass.
- **Redundant write detection** — MCP audit entries now flag writes where before/after values are identical.

## [1.5.0] - 2026-04-06

### Added

- **Enriched audit/telemetry metrics** — `duration`, `responseSize`, `requestSize`, `hit`/`miss`, `tier`, `entryCount`, `redundant` fields in MCP audit entries.
- **`--detailed` flag** — `codex_audit` and `cclid audit` show per-entry metrics when `--detailed` is passed.
- **Token-efficiency section in stats** — hit rate, redundant write rate, response bytes, avg latency.
- **`--hits`, `--misses`, `--redundant` audit filters** — query audit log by cache effectiveness.

### Fixed

- **Telemetry race condition** — concurrent MCP calls could interleave JSONL writes. Added pending-write tracking.

## [1.4.2] - 2026-04-06

### Fixed

- **Regex injection in search** — code scanning alert resolved for user-supplied regex patterns.
- **SECURITY.md** — added vulnerability reporting policy.
- **Schema guide** — documented recommended namespaces and prefer-MCP guidance.

## [1.4.1] - 2026-04-06

### Changed

- **Agent-agnostic optimizations** — enriched MCP tool descriptions, tier guidance, deduped arch/files entries.
- **Test isolation** — `CODEX_DATA_DIR` redirects audit/telemetry to temp dir during tests.
- **`conventions.persistence`** — clear lanes for `.codexcli.json`, `CLAUDE.md`, `MEMORY.md`.

## [1.4.0] - 2026-04-06

### Added

- **Tiered `codex_context`** — `essential`, `standard` (default, excludes `arch.*`), `full` tiers to control context size.
- **`files.*` namespace** — key file paths and their roles stored in project data.
- **CLAUDE.md overhaul** — bootstrap instructions, prefer-MCP guidance, write-back reminders.

### Changed

- **Data cleanup** — removed duplicate arch/files entries, enriched tool descriptions.

## [1.3.0] - 2026-04-05

### Added

- **Audit UI redesign** — `cclid audit` with before/after diffs, collapsed dates, color-coded status.
- **Source filters** — `--mcp` and `--cli` flags to filter audit entries by source.
- **Log reset support** — `cclid data reset logs` to clear audit and telemetry logs.

### Fixed

- **DRY cleanup** — extracted `parsePeriodDays`, shared log paths, unified audit filtering.

## [1.2.1] - 2026-04-04

### Fixed

- **75 lint errors resolved** — auto-fixed redundant type constituents, switched to nullish coalescing where safe, added `void` to fire-and-forget telemetry/audit promises, suppressed unavoidable `any` in dynamic MCP tool wrapper.
- **Prototype pollution in `deepMerge()`** — added `isSafeKey()` guard to block `__proto__`, `constructor`, and `prototype` keys during JSON import merges.
- **Audit/telemetry log file permissions** — explicit `0o600` mode on `appendFile` so logs are created owner-readable only.
- **Predictable temp file names in edit** — replaced `Date.now()` naming with `fs.mkdtempSync()` for secure temp directory creation.
- **Encrypted values in audit params** — `sanitizeParams()` now masks encrypted values as `[encrypted]` in addition to redacting passwords.
- **Test data removed from `.codexcli.json`** — cleaned leaked `test.*` and `search.test.*` entries from project data file.

## [1.2.0] - 2026-04-04

### Added

- **Audit log** — full mutation tracking at `~/.codexcli/audit.jsonl`. Captures before/after values, success/fail, scope, agent identity, and sanitized params for every write operation. Encrypted values masked, passwords redacted.
- **`codex_audit` MCP tool** — query the audit log with key filter, time period, writes-only, and limit.
- **`ccli audit [key]` CLI command** — browse audit entries with diff-style before/after display. Supports `--period`, `--writes`, `--json`, `--limit`.
- **Scope tracking in telemetry** — telemetry now tracks scope as `project`, `global`, or `unscoped` for unresolved/auto cases. Stats display shows scope breakdown.
- **`--agent` flag** on `ccli mcp-server` — sets `CODEX_AGENT_NAME` for audit attribution. Also readable via env var.

### Fixed

- **`codex_alias_remove` scope bug** (#36) — MCP handler now uses `removeAlias()` which correctly falls through project → global, instead of manual merged-map delete that silently succeeded on the wrong scope.
- **`codex_stale` and `codex_lint` classification** — now correctly classified as read ops instead of meta.

### Changed

- **Unified CLI + MCP telemetry** — CLI commands now log to telemetry alongside MCP calls. Stats display separates MCP sessions from CLI calls.
- **`.codexcli.json` overhauled** — tightened entries, removed redundant `files.*` namespace, added `project.vision`, `project.install`, `context.devWorkflow`, full `_meta` timestamps.

## [0.8.0] - 2026-04-02

### Added

- **`codex_context` MCP tool** — returns a compact flat summary of all stored project knowledge in one call. Designed for AI agents to bootstrap context at session start.
- **`CODEX_PROJECT_DIR` environment variable** — alternative to `--cwd` for telling the MCP server where the project root is.
- **Recommended schema** — documented namespace conventions (`project.*`, `commands.*`, `arch.*`, `conventions.*`, `context.*`, `files.*`, `deps.*`) for organizing project knowledge.
- **AI agent workflow** — LLM instructions rewritten to guide agents on bootstrapping from stored context, recording discoveries, and maintaining the knowledge base.
- CodexCLI's own `.codexcli.json` populated with real project data as a living example.

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
