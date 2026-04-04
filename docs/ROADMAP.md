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
- [x] MCP server with 16 tools for AI agent integration
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

---

## In Progress / Next Up

### Staleness Detection
Entries go stale as code evolves. The knowledge base needs signals to help agents (and humans) know when to trust stored data.

- [ ] Add optional `_meta` section to data.json tracking last-modified timestamps per key
- [ ] `codex_context` includes age indicator for old entries (e.g., `[30d]` prefix)
- [ ] `ccli get --stale <days>` shows entries not updated in N days
- [ ] MCP tool: `codex_stale` returns entries older than a threshold

### Git-Aware Freshness
Connect stored knowledge to the files it describes. When code changes, flag related entries.

- [ ] Optional `_source` metadata linking entries to file paths (e.g., `arch.storage` → `src/store.ts`)
- [ ] `ccli check` compares entry source files against git diff to flag potentially stale entries
- [ ] MCP tool: `codex_check` returns entries whose source files have changed since last update

### Schema Validation
Help users and agents follow the recommended schema.

- [ ] `ccli lint` warns about entries outside recognized namespaces
- [ ] Configurable schema rules in `.codexcli.json` (optional `_schema` section)
- [ ] MCP tool descriptions include namespace hints

### Init Scaffolding
Make project setup faster by auto-populating from existing project files.

- [ ] `ccli init --scaffold` reads `package.json`, `README.md`, `Makefile`, etc. and populates `project.*`, `commands.*`, `deps.*`
- [ ] Interactive mode: presents discovered info and asks which to keep
- [ ] Works with non-Node projects (detect Go, Python, Rust, etc.)

### Interpolation Enhancements
Expand the `${key}` interpolation system with fallbacks and stored command chains.

- [ ] Conditional interpolation: `${ref:-default}` and `${ref:?error}` syntax for fallback values ([#14](https://github.com/seabearDEV/codexCLI/issues/14))
- [ ] Stored command chains / macros: store a list of key references that `run` resolves and executes as a chain ([#16](https://github.com/seabearDEV/codexCLI/issues/16))

### Search & Navigation
Make finding and selecting entries faster and more powerful.

- [ ] Advanced search: regex patterns, field-specific search (key-only, value-only), boolean operators ([#9](https://github.com/seabearDEV/codexCLI/issues/9))
- [ ] Fuzzy finder integration: `ccli get --interactive` or `ccli find --fzf` for interactive key selection ([#13](https://github.com/seabearDEV/codexCLI/issues/13))

### Richer Data Types
Currently all values are strings. Some knowledge is better expressed as lists or structured data.

- [ ] Support list values (e.g., `arch.patterns` → `["MVC", "Repository", "Observer"]`)
- [ ] Support multi-line values with better display formatting
- [ ] `codex_get` returns typed JSON when values are structured

### Data Management
Tools for maintaining the knowledge base over time.

- [ ] Backup rotation: automatic pruning with configurable retention (keep last N backups) ([#10](https://github.com/seabearDEV/codexCLI/issues/10))

### Team Workflows
Make the knowledge base useful for teams, not just solo developers.

- [ ] Entry attribution: track who (human or AI) last modified each entry
- [ ] `ccli log` shows history of changes / audit trail (like `git log` for the knowledge base) ([#12](https://github.com/seabearDEV/codexCLI/issues/12))
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
