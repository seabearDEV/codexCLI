# CodexCLI — Known Issues & Missing Features

Comprehensive audit of bugs, inconsistencies, and missing features.

---

## P0 — Bugs (FIXED)

### 1. ~~`showExamples()` references non-existent flags `-k`, `-v`, `-e`~~ FIXED

**File:** `src/formatting.ts`

Examples now use valid flags: `get -a` (aliases only), `find prod -e` (entries only), `find ip -a` (aliases only), `find server -t` (tree).

### 2. ~~`showHelp()` config signature and subcommands are wrong~~ FIXED

**File:** `src/formatting.ts`

Config line now shows `<subcommand>` and SUBCOMMANDS section includes `set, get, info, examples, completions`.

### 3. ~~`displayAliases` empty-state message references deleted command~~ FIXED

**File:** `src/commands/helpers.ts`

Message now shows the correct command: `set <key> <value> -a <alias>`.

### 4. ~~`data export all -o <file>` overwrites same file three times~~ FIXED

**File:** `src/commands/data-management.ts`

When `type === 'all'` and `-o` is specified, filenames are suffixed with the type (e.g., `backup-entries.json`, `backup-aliases.json`, `backup-confirm.json`).

---

## P1 — Security & Platform Gaps (FIXED)

### 5. ~~MCP `codex_run` ignores `confirm` metadata~~ FIXED

**File:** `src/mcp-server.ts`

`codex_run` now imports `hasConfirm` and checks confirm metadata before executing. If an entry has confirm set and `force` is not `true` (and not a dry run), execution is refused with an error message. Added `force` parameter to the tool schema.

### 6. ~~Windows clipboard is unsupported~~ FIXED

**File:** `src/utils/clipboard.ts`

Added `win32` platform support using `clip` command.

### 7. ~~Data files use default permissions (0644)~~ FIXED

**File:** `src/utils/atomicWrite.ts`, `src/utils/paths.ts`, `src/commands/data-management.ts`

- `atomicWriteFileSync` now writes files with mode `0o600` (owner read/write only)
- `ensureDataDirectoryExists` now creates directories with mode `0o700`
- Export files in `data-management.ts` also use mode `0o600`

---

## P2 — Missing Core Features (FIXED)

### 8. ~~No stdin piping for `set`~~ FIXED

`set` now reads from stdin when piped (non-TTY): `echo "value" | ccli set key`.

### 9. ~~No `edit` command (`$EDITOR` support)~~ FIXED

Added `edit` (alias `e`) command: `ccli edit <key>` opens the value in `$EDITOR`/`$VISUAL`. Supports `--decrypt` for encrypted entries.

### 10. ~~MCP has no encryption support (set/get)~~ FIXED

`codex_set` now accepts `encrypt` and `password` parameters. `codex_get` now accepts `decrypt` and `password` parameters.

### 11. ~~`confirm` is not a standalone export/import type~~ FIXED

`confirm` is now a valid standalone type for `data export`, `data import`, and `data reset`. Also added to MCP `codex_export`, `codex_import`, and `codex_reset`.

### 12. ~~No file locking for concurrent access~~ FIXED

Added advisory file locking (`src/utils/fileLock.ts`) using `.lock` files with atomic `O_CREAT|O_EXCL`. Integrated into `saveJsonSorted` — all writes are now lock-protected. Stale locks (>10s) are automatically broken.

### 13. ~~No auto-backup before destructive operations~~ FIXED

Added `src/utils/autoBackup.ts`. Automatic backups are created in `~/.codexcli/.backups/` before `data reset` and non-merge `data import`.

### 14. ~~No `--json` output format~~ FIXED

Added `--json` / `-j` flag to `get` and `find` commands for machine-readable JSON output.

---

## P3 — Nice-to-Have Features

### 15. Fish/PowerShell shell completion

Only Bash and Zsh are supported. Fish and PowerShell users get no completions or wrapper.

### 16. No `copy`/`cp` command

Cannot duplicate an entry to a new key without get + set.

### 17. No import preview/diff

`data import --merge` silently overwrites conflicting keys with no way to preview what will change.

### 18. No advanced search (regex, boolean operators)

`find` only does case-insensitive substring matching. No regex, field-specific search, or boolean operators.

### 19. No backup rotation / automatic backup management

No built-in way to maintain a set of N recent backups.

### 20. No command output capture

`run` inherits stdio — no way to capture command output for chaining.

### 21. No change log / audit trail

No record of what was added, changed, or deleted over time.

### 22. No fuzzy finder integration

No `fzf` or similar interactive selection for keys.

### 23. No conditional interpolation

No `${ref:-default}` or `${ref:?error}` syntax for fallback values.

### 24. No batch operations

Cannot set multiple entries in one command.

---

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 4 | ~~Bugs showing incorrect info or causing data loss~~ ALL FIXED |
| **P1** | 3 | ~~Security and platform gaps~~ ALL FIXED |
| **P2** | 7 | ~~Missing core features~~ ALL FIXED |
| **P3** | 10 | Nice-to-have features |
