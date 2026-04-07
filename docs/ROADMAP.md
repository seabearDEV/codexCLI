# CodexCLI Roadmap

## Vision

CodexCLI is a structured, persistent knowledge base for software projects — accessible to both humans via CLI and AI agents via MCP. The goal is to make AI agents more efficient by giving them a way to learn, record, and share project knowledge across sessions.

**Planned work is tracked in [GitHub Issues](https://github.com/seabearDEV/codexCLI/issues).** This document provides the high-level vision and release history.

---

## What's Next

### Smarter Knowledge Management

Make the knowledge base aware of the code it describes, and easier to navigate.

- **Git-aware freshness** — link entries to source files, flag staleness on code changes ([#42](https://github.com/seabearDEV/codexCLI/issues/42))
- **Live audit streaming** — `ccli audit --follow` for real-time formatted output ([#41](https://github.com/seabearDEV/codexCLI/issues/41))
- **Fuzzy finder** — interactive search via fzf ([#13](https://github.com/seabearDEV/codexCLI/issues/13))
- **Boolean search** — AND, OR, NOT operators ([#43](https://github.com/seabearDEV/codexCLI/issues/43))
- **Richer data types** — lists, multi-line values, typed JSON ([#44](https://github.com/seabearDEV/codexCLI/issues/44))

### Team & Collaboration

Make the knowledge base useful for teams, not just solo developers.

- **Entry attribution** — track who/what last modified each entry ([#45](https://github.com/seabearDEV/codexCLI/issues/45))
- **Merge conflict handling** — custom merge driver or tooling for `.codexcli.json` ([#46](https://github.com/seabearDEV/codexCLI/issues/46))
- **`ccli diff`** — compare local vs committed entries ([#47](https://github.com/seabearDEV/codexCLI/issues/47))

### Platform & Distribution

- **Fish/PowerShell completion** ([#6](https://github.com/seabearDEV/codexCLI/issues/6))
- **Windows support** ([#49](https://github.com/seabearDEV/codexCLI/issues/49))
- **`npx codexcli`** zero-install usage ([#50](https://github.com/seabearDEV/codexCLI/issues/50))
- **IDE extensions** — VS Code and JetBrains ([#51](https://github.com/seabearDEV/codexCLI/issues/51))
- **Performance at scale** — benchmarks, lazy loading, indexing ([#48](https://github.com/seabearDEV/codexCLI/issues/48))

### Housekeeping

- **Interpolation escape audit** — scan entries for unescaped syntax landmines ([#39](https://github.com/seabearDEV/codexCLI/issues/39))
- **Rename `--raw` flag** — clarify that it means "no colors", not "no interpolation" ([#40](https://github.com/seabearDEV/codexCLI/issues/40))

### Long-term: Go Rewrite

A Go rewrite is planned for better performance and single-binary distribution without Node.js. Port core operations, MCP server, and data format compatibility. No issue yet — this is a future initiative.

---

## Release History

### v1.9.0 — Observed Token Savings
Net token savings, miss-path tracking, self-calibrating exploration costs per namespace.

### v1.8.0 — CLI Restructure
`alias`/`confirm` subcommand groups, `context` command, enhanced `ccli init` with codebase scanning, stored command chains (`--chain`).

### v1.7.0 — Staleness & Testing
Inline staleness tags in `codex_context`/`codex_get`, exploration-weighted token savings, test suite overhaul (633 → 1048 tests).

### v1.5.0 — v1.6.0 — Enriched Telemetry
Audit/telemetry metrics (duration, hit/miss, redundant), two-step MCP confirmation, namespace-weighted token savings, import flat-key expansion.

### v1.0.0 — v1.4.0 — Production Ready
Staleness detection, schema validation (`ccli lint`), regex search, audit log, tiered `codex_context`, agent-agnostic optimizations.

### v0.9.0 — Conditional Interpolation & Telemetry
`${key:-default}`/`${key:?error}`, MCP telemetry, backup rotation, init scaffolding.

### v0.8.0 — GenAI Knowledge Base
`codex_context` for one-call bootstrap, recommended schema, project-scoped `.codexcli.json`.

### v0.6.0 — v0.7.0 — Unified Store
Consolidated data format, project/global scope resolution, auto-migration.

### v0.1.0 — v0.5.0 — Core CLI
Hierarchical storage, interpolation, aliases, encryption, MCP server, shell completion.
