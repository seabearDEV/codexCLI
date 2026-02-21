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

## P2 — Missing Core Features

### 8. No stdin piping for `set`

Cannot do `echo "value" | ccli set key` — there's no way to pipe input to `set`. The `--prompt` flag requires a TTY.

### 9. No `edit` command (`$EDITOR` support)

No way to open a value in `$EDITOR` for editing. Users must `get`, copy, then `set -f` with the new value.

### 10. MCP has no encryption support (set/get)

**File:** `src/mcp-server.ts`

`codex_set` has no `encrypt` parameter. `codex_get` can't decrypt values — they always show as `[encrypted]`.

### 11. `confirm` is not a standalone export/import type

**File:** `src/commands/helpers.ts:164`

`VALID_DATA_TYPES` only includes `entries`, `aliases`, `all`. There's no way to export or import just the `confirm` metadata.

### 12. No file locking for concurrent access

Multiple processes writing to the same JSON files simultaneously could cause data corruption. No advisory locking is implemented.

### 13. No auto-backup before destructive operations

`data reset` and `data import` (without `--merge`) destroy data with no automatic backup.

### 14. No `--json` output format

No way to get machine-readable JSON output for scripting beyond `--raw`.

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
| **P2** | 7 | Missing core features |
| **P3** | 10 | Nice-to-have features |
