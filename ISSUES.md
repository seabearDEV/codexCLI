# CodexCLI — Known Issues & Missing Features

Comprehensive audit of bugs, inconsistencies, and missing features.

---

## P0 — Bugs (incorrect behavior visible to users)

### 1. `showExamples()` references non-existent flags `-k`, `-v`, `-e`

**File:** `src/formatting.ts:205,224-225`

The `config examples` output shows three flags that don't exist:

| Example shown | Flag | Actual behavior |
|---|---|---|
| `ccli get -e` | `-e` ("entries only") | No such flag on `get`; `-e` is not registered |
| `ccli find server -k` | `-k` ("keys only") | No such flag on `find`; only `-e`, `-a`, `-t` exist |
| `ccli find production -v` | `-v` ("values only") | No such flag on `find`; only `-e`, `-a`, `-t` exist |

**Fix:** Remove the `get -e` example (there's no entries-only filter on `get`). Replace `-k` and `-v` examples with valid flags or remove them.

---

### 2. `showHelp()` config signature and subcommands are wrong

**File:** `src/formatting.ts:121,125`

- Help shows `config [setting] [value]` — but `config` takes no positional arguments. Passing `ccli config theme dark` triggers a Commander error because "theme" is not a registered subcommand.
- The SUBCOMMANDS section lists `info, examples, completions` but **omits `set` and `get`**, which are real config subcommands.

**Fix:** Change the config args column to `<subcommand>` and add `set`, `get` to the subcommands line.

---

### 3. `displayAliases` empty-state message references deleted command

**File:** `src/commands/helpers.ts:91`

When no aliases exist, the message says:
```
No aliases found. Add one with "ccli alias set <name> <command>"
```

There is no `alias set` command. The correct way to create an alias is:
```
ccli set <key> <value> -a <alias_name>
```

**Fix:** Update the message to show the correct command.

---

### 4. `data export all -o <file>` overwrites same file three times

**File:** `src/commands/data-management.ts:25-41`

When `type === 'all'` and `-o output.json` is specified, all three writes (entries, aliases, confirm) go to the same file path. Each write overwrites the previous — only the last one (confirm keys) survives.

Without `-o`, each type gets a unique timestamped filename, so the bug only manifests with the explicit output flag.

**Fix:** When `type === 'all'` and `-o` is given, either:
- Ignore `-o` and use per-type timestamped filenames (warn the user), or
- Suffix the provided filename with the type (e.g., `backup-entries.json`, `backup-aliases.json`, `backup-confirm.json`)

---

## P1 — Security & Platform Gaps

### 5. MCP `codex_run` ignores `confirm` metadata

**File:** `src/mcp-server.ts`

The `codex_run` MCP tool executes stored commands but never loads or checks `confirm.json`. Entries marked with `--confirm` will execute without prompting when invoked via AI agents.

### 6. Windows clipboard is unsupported

**File:** `src/utils/clipboard.ts`

The clipboard utility throws `"Clipboard not supported on platform: win32"` — but the tool ships npm binaries that could run on Windows. Use `clip.exe` for Windows support.

### 7. Data files use default permissions (0644)

**File:** `src/storage.ts`, `src/utils/atomicWrite.ts`

Files in `~/.codexcli/` are created with default permissions, meaning other users on a shared system can read them. For a tool storing secrets, files should use `0600`.

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
| **P0** | 4 | Bugs showing incorrect info or causing data loss |
| **P1** | 3 | Security and platform gaps |
| **P2** | 7 | Missing core features |
| **P3** | 10 | Nice-to-have features |
