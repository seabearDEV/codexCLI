# CodexCLI Roadmap

## Vision

CodexCLI is a structured, persistent knowledge base for software projects — accessible to both humans via CLI and AI agents via MCP. The goal is to make AI agents more efficient by giving them a way to learn, record, and share project knowledge across sessions.

## Completed

### Core CLI (v0.1.0 — v0.5.x)
- [x] Hierarchical data storage with dot notation
- [x] Command runner with composition (`:`) and chaining (`&&`)
- [x] Variable interpolation (`${key}`) and exec interpolation (`$(key)`)
- [x] Aliases, encryption, search, tree visualization
- [x] Clipboard integration, inline editing (`$EDITOR`)
- [x] JSON output, stdin piping, batch set
- [x] Advisory file locking, atomic writes, auto-backup
- [x] Shell tab-completion (Bash, Zsh) with dynamic key completion
- [x] Shell wrapper for `cd`/`export` in current shell
- [x] Per-entry confirmation (`--confirm` / `--no-confirm`)
- [x] MCP server with 19 tools for AI agent integration
- [x] LLM instructions (built-in defaults, user-overridable via `system.llm.instructions`)
- [x] Depth-limited browsing (`--depth` / `-k`)
- [x] Keys-only default output with `--values` flag

### Unified Store & Project Scope (v0.6.0 — v0.7.0)
- [x] Consolidated `entries.json` + `aliases.json` + `confirm.json` into single `data.json`
- [x] Auto-migration from old 3-file format
- [x] Project-scoped `.codexcli.json` files (`ccli init`)
- [x] Scope resolution: project → global fallthrough for reads
- [x] `--global` / `-G` flag on all data commands
- [x] `--all` / `-A` flag on `get` for both scopes with section headers
- [x] `--project` / `-P` flag on data management commands
- [x] MCP `scope` parameter on all data-touching tools
- [x] `mcp-server --cwd` flag for project root detection

### GenAI Knowledge Base (v0.8.0)
- [x] `codex_context` MCP tool for one-call session bootstrap
- [x] `CODEX_PROJECT_DIR` environment variable
- [x] Recommended schema (project/commands/arch/conventions/context/files/deps)
- [x] LLM instructions rewritten for active learning workflow
- [x] `.codexcli.json` committed to version control (not gitignored)
- [x] Living example: CodexCLI's own `.codexcli.json` populated with real project data

### Performance & Fixes (v0.8.1)
- [x] Performance audit: cached `isColorEnabled`, batched file writes, single-stat loads, deferred alias maps
- [x] `codex_rename` MCP tool (entry + alias rename with alias re-pointing and confirm migration)
- [x] Fixed DEBUG check inconsistency across modules
- [x] Removed dead code (~100 lines), deduplicated CLI_TREE shortcuts

### v0.9.x
- [x] Conditional interpolation: `${key:-default}` and `${key:?error}` ([#14](https://github.com/seabearDEV/codexCLI/issues/14), [PR #31](https://github.com/seabearDEV/codexCLI/pull/31))
- [x] MCP telemetry: usage tracking, `codex_stats` tool, `ccli stats` command ([PR #32](https://github.com/seabearDEV/codexCLI/pull/32))
- [x] Configurable backup rotation: `max_backups` config setting ([#10](https://github.com/seabearDEV/codexCLI/issues/10), [PR #33](https://github.com/seabearDEV/codexCLI/pull/33))
- [x] Init scaffolding: `ccli init --scaffold` for Node.js, Go, Python, Rust ([PR #33](https://github.com/seabearDEV/codexCLI/pull/33))
- [x] LLM instructions refactor: append model, `ccli config llm-instructions` ([PR #34](https://github.com/seabearDEV/codexCLI/pull/34))

### v1.0.0 — v1.4.x
- [x] Staleness detection: `_meta` timestamps, `ccli stale`, `codex_stale`, age tags in `codex_context`
- [x] Schema validation: `ccli lint`, configurable `_schema.namespaces`
- [x] Advanced search: regex patterns (`--regex`), field-specific filtering (`--keys`, `--values`)
- [x] Audit log: before/after diffs, agent identity, `ccli audit` + `codex_audit`
- [x] Tiered `codex_context`: essential, standard, full tiers for token efficiency
- [x] Test isolation: `CODEX_DATA_DIR` redirects global store + audit/telemetry to temp dir
- [x] Agent-agnostic optimizations: enriched tool descriptions, deduped entries, "prefer MCP" guidance
- [x] `deps.*` namespace, workflow aliases, [Schema Guide](schema-guide.md)

### v1.5.x — v1.6.x
- [x] Enriched audit/telemetry: duration, hit/miss, redundant detection, responseSize, per-agent stats
- [x] Two-step MCP confirmation: `confirm_token` flow for `codex_run` with `--confirm` entries
- [x] Import flat-key expansion: `expandFlatKeys()` auto-converts dot-notation keys to nested structure
- [x] Inline staleness warnings: `[untracked]` / `[Nd]` tags on `codex_get` and `codex_context` output, CLI yellow warning
- [x] `getStalenessTag()` shared helper with 30-day threshold, untracked entries treated as most suspect
- [x] Namespace-weighted token savings: exploration cost multipliers per namespace, bootstrap estimation, per-namespace breakdown in `codex_stats --detailed`
- [x] [Token Savings documentation](token-savings.md): full methodology transparency with Mermaid diagrams
- [x] LLM instructions expanded: all 19 MCP tools documented in 6 groups, FRESHNESS guidance added
- [x] `codex_stale` sorts untracked entries first, uses consistent "untracked" wording across CLI and MCP

---

## Next

### Stored Command Chains / Macros
Store reusable sequences of key references that `run` resolves and executes as a chain.

- [ ] Syntax for key references in stored values (e.g., space-separated keys or a dedicated marker) ([#16](https://github.com/seabearDEV/codexCLI/issues/16))
- [ ] Recursion depth limits and interaction with `--dry`, `--confirm`, interpolation

---

## Post-1.0

### Git-Aware Freshness
Connect stored knowledge to the files it describes. When code changes, flag related entries.

- [ ] Optional `_source` metadata linking entries to file paths (e.g., `arch.storage` → `src/store.ts`)
- [ ] `ccli check` compares entry source files against git diff to flag potentially stale entries
- [ ] MCP tool: `codex_check` returns entries whose source files have changed since last update

### Search & Navigation Enhancements
- [ ] Fuzzy finder integration: `ccli get --interactive` or `ccli find --fzf` ([#13](https://github.com/seabearDEV/codexCLI/issues/13))
- [ ] Boolean search operators (AND, OR, NOT)

### Richer Data Types
Currently all values are strings. Some knowledge is better expressed as lists or structured data.

- [ ] Support list values (e.g., `arch.patterns` → `["MVC", "Repository", "Observer"]`)
- [ ] Support multi-line values with better display formatting
- [ ] `codex_get` returns typed JSON when values are structured

### Team Workflows
Make the knowledge base useful for teams, not just solo developers.

- [ ] Entry attribution: track who (human or AI) last modified each entry
- [ ] `ccli log` shows history of changes / audit trail ([#12](https://github.com/seabearDEV/codexCLI/issues/12))
- [ ] Merge conflict handling for `.codexcli.json` (custom merge driver or guidance)
- [ ] `ccli diff` compares local vs committed entries

### Performance & Scale
Ensure CodexCLI stays fast as knowledge bases grow.

- [ ] Benchmark: measure latency at 100, 500, 1000+ entries
- [ ] Lazy loading: only parse sections of `data.json` that are accessed
- [ ] Index file for large stores (avoid full JSON parse on every read)

### Cross-Platform / Distribution
- [ ] Fish and PowerShell shell completion ([#6](https://github.com/seabearDEV/codexCLI/issues/6))
- [ ] Windows support testing and fixes
- [ ] `npx codexcli` for zero-install usage
- [ ] VS Code extension: browse/edit entries from the sidebar
- [ ] JetBrains plugin

### Go Rewrite (Long-term)
A Go rewrite is planned for better performance and single-binary distribution without Node.js. See `docs/go-rewrite-plan.md` for details.

- [ ] Port core data operations (set, get, remove, search)
- [ ] Port MCP server
- [ ] Data format compatibility (read/write same `.codexcli.json`)
- [ ] Feature parity with TypeScript version
- [ ] Migration path for existing users
