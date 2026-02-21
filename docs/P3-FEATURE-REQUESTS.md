# P3 Feature Requests — GitHub Issue Templates

Each section below is a self-contained GitHub issue. Copy the **Title** into the
issue title and the **Body** into the issue description. Apply labels:
`enhancement`, `P3`, `good first issue` (where noted).

---

## Issue #15 — Fish & PowerShell Shell Completions

**Title:** Add Fish and PowerShell shell completions

**Labels:** `enhancement`, `P3`, `good first issue`

**Body:**

### Problem

`ccli config completions` only generates scripts for **Bash** and **Zsh**.
Users on Fish or PowerShell have no tab-completion support and no shell wrapper
function.

### Desired Behavior

- `ccli config completions fish` outputs a Fish completion script.
- `ccli config completions powershell` outputs a PowerShell completion script.
- Both scripts should cover all subcommands, flags, and dynamic key completion
  (if feasible).

### Relevant Files

- `src/commands/config.ts` — completions subcommand handler
- `src/formatting.ts` — help text references

### Acceptance Criteria

- [ ] Fish completions script generated and working
- [ ] PowerShell completions script generated and working
- [ ] Help text updated to list Fish and PowerShell as supported shells
- [ ] Tests added for both output paths

---

## Issue #16 — `copy` / `cp` Command

**Title:** Add `copy` (cp) command to duplicate entries

**Labels:** `enhancement`, `P3`, `good first issue`

**Body:**

### Problem

There is no way to duplicate an entry to a new key without manually running
`ccli get <src>` then `ccli set <dest> <value>`. This is tedious and
error-prone, especially for entries with aliases, confirm flags, or encrypted
values.

### Desired Behavior

```
ccli copy <source-key> <destination-key> [options]
ccli cp <source-key> <destination-key> [options]
```

Options:
- `--with-aliases` — also copy aliases from the source entry
- `--with-confirm` — also copy the confirm flag
- `--overwrite` — allow overwriting an existing destination key

### Relevant Files

- `src/commands/` — new command file needed
- `src/main.ts` — command registration

### Acceptance Criteria

- [ ] `copy`/`cp` command implemented
- [ ] Copies value (and optionally aliases/confirm) to new key
- [ ] Refuses to overwrite existing key unless `--overwrite` is passed
- [ ] MCP `codex_copy` tool added
- [ ] Tests covering happy path, overwrite protection, and options

---

## Issue #17 — Import Preview / Diff

**Title:** Add preview/diff mode for `data import --merge`

**Labels:** `enhancement`, `P3`

**Body:**

### Problem

`data import --merge` silently overwrites conflicting keys. Users have no way
to see what will change before committing the merge.

### Desired Behavior

```
ccli data import entries backup.json --merge --dry-run
```

Output should show:
- **Added** keys (exist in file but not locally)
- **Modified** keys (exist in both, values differ) with old → new diff
- **Unchanged** keys (exist in both, values match)

When `--dry-run` is not passed, the import proceeds as normal.

### Relevant Files

- `src/commands/data-management.ts` — import logic

### Acceptance Criteria

- [ ] `--dry-run` (or `--preview`) flag added to `data import`
- [ ] Output clearly shows added / modified / unchanged keys
- [ ] Modified keys show before and after values
- [ ] No data is written when `--dry-run` is active
- [ ] Tests for each category (added, modified, unchanged)

---

## Issue #18 — Advanced Search (Regex, Boolean Operators)

**Title:** Add regex and advanced search operators to `find`

**Labels:** `enhancement`, `P3`

**Body:**

### Problem

`find` only supports case-insensitive substring matching. Power users need
regex patterns, field-specific search, and boolean operators.

### Desired Behavior

```
ccli find '/^prod-.*db$/' --regex          # regex pattern
ccli find prod --keys-only                 # search keys only
ccli find password --values-only           # search values only
ccli find 'prod AND db'                    # boolean AND
ccli find 'staging OR dev'                 # boolean OR
```

### Relevant Files

- `src/commands/helpers.ts` — `findEntries()` function
- `src/formatting.ts` — help text

### Acceptance Criteria

- [ ] `--regex` / `-r` flag for regex pattern matching
- [ ] `--keys-only` and `--values-only` flags for field-specific search
- [ ] Basic boolean operators (AND, OR) supported
- [ ] Existing substring behavior unchanged (backward compatible)
- [ ] Tests for regex, field-specific, and boolean queries

---

## Issue #19 — Backup Rotation / Automatic Backup Management

**Title:** Add backup rotation to limit stored backups

**Labels:** `enhancement`, `P3`

**Body:**

### Problem

Auto-backups (added in P2 #13) accumulate indefinitely in
`~/.codexcli/.backups/`. There is no built-in way to keep only the N most
recent backups or delete old ones.

### Desired Behavior

```
ccli config set backup-retention 10        # keep last 10 backups
ccli data backups                          # list all backups with timestamps
ccli data backups --prune                  # delete backups beyond retention limit
```

- Auto-backup should respect the retention setting and prune old backups after
  creating a new one.
- Default retention: 10 backups.

### Relevant Files

- `src/utils/autoBackup.ts` — backup creation
- `src/commands/data-management.ts` — data subcommands
- `src/commands/config.ts` — config settings

### Acceptance Criteria

- [ ] Configurable retention count (default 10)
- [ ] `data backups` command lists existing backups
- [ ] `data backups --prune` manually prunes old backups
- [ ] Auto-backup automatically prunes after creating a new backup
- [ ] Tests for retention logic and pruning

---

## Issue #20 — Command Output Capture

**Title:** Add output capture mode to `run` command

**Labels:** `enhancement`, `P3`

**Body:**

### Problem

`run` inherits stdio, so command output goes directly to the terminal. There is
no way to capture the output for piping, storing, or chaining with other
commands.

### Desired Behavior

```
ccli run deploy-script --capture            # print output after execution
ccli run deploy-script --capture --quiet    # suppress live output, print at end
ccli run health-check --capture --set-result health-status
                                            # capture output and store as new entry
```

The `--capture` flag buffers stdout/stderr and makes it available for:
- Printing after the command exits
- Storing as a new codexCLI entry via `--set-result <key>`
- Piping to other commands via stdout

### Relevant Files

- `src/commands/run.ts` — run command implementation

### Acceptance Criteria

- [ ] `--capture` flag implemented
- [ ] `--quiet` suppresses live output when combined with `--capture`
- [ ] `--set-result <key>` stores captured output as a new entry
- [ ] Exit code still propagated correctly
- [ ] Tests for capture, quiet, and set-result modes

---

## Issue #21 — Change Log / Audit Trail

**Title:** Add change log / audit trail for entry modifications

**Labels:** `enhancement`, `P3`

**Body:**

### Problem

There is no record of what was added, changed, or deleted. Users cannot answer
"when did this value change?" or "who deleted that key?".

### Desired Behavior

```
ccli log                                   # show recent changes
ccli log --key prod-db                     # show history for a specific key
ccli log --limit 20                        # show last 20 changes
ccli log --since 2025-01-01                # show changes since a date
```

Each log entry should record:
- Timestamp
- Operation (set, delete, import, reset, copy, edit)
- Key affected
- Old value (truncated/redacted for encrypted entries)
- New value (truncated/redacted for encrypted entries)

### Relevant Files

- New file: `src/utils/auditLog.ts`
- `src/commands/` — integration into set, delete, import, reset, edit, copy

### Acceptance Criteria

- [ ] Audit log written to `~/.codexcli/.audit.log` (or similar)
- [ ] All mutating operations log their changes
- [ ] `log` command with filtering by key, count, and date
- [ ] Encrypted values are redacted in the log
- [ ] Log file uses restrictive permissions (0600)
- [ ] Tests for logging and query filters

---

## Issue #22 — Fuzzy Finder Integration

**Title:** Add fuzzy finder (fzf) integration for interactive key selection

**Labels:** `enhancement`, `P3`

**Body:**

### Problem

Users with many entries have no interactive way to browse and select keys.
They must know the exact key name or use `find` first.

### Desired Behavior

```
ccli get --interactive                     # launch fzf to pick a key, then show value
ccli get -i                                # short form
ccli run -i                                # pick a runnable entry interactively
ccli edit -i                               # pick an entry to edit interactively
```

- If `fzf` is installed, pipe keys into it for fuzzy selection.
- If `fzf` is not installed, fall back to a simple numbered list prompt.
- Preview pane shows the value of the highlighted key.

### Relevant Files

- New file: `src/utils/fuzzySelect.ts`
- `src/commands/` — integration into get, run, edit, delete

### Acceptance Criteria

- [ ] `--interactive` / `-i` flag on get, run, edit, delete
- [ ] fzf integration with preview pane
- [ ] Graceful fallback when fzf is not installed
- [ ] Tests (mocked fzf process)

---

## Issue #23 — Conditional Interpolation / Fallback Syntax

**Title:** Add conditional interpolation with fallback values

**Labels:** `enhancement`, `P3`

**Body:**

### Problem

Cross-references (`${key}`) fail with an error when the referenced key doesn't
exist. There is no way to specify a default/fallback value or produce a custom
error message.

### Desired Behavior

```
ccli set conn '${db-host:-localhost}:${db-port:-5432}'
ccli set deploy '${deploy-target:?ERROR: deploy-target must be set}'
```

Syntax (follows Bash parameter expansion conventions):
- `${key:-default}` — use `default` if `key` is unset or empty
- `${key:+alternate}` — use `alternate` if `key` IS set
- `${key:?error message}` — abort with error message if `key` is unset

### Relevant Files

- `src/utils/interpolation.ts` (or wherever `${}` resolution lives)
- `src/commands/helpers.ts`

### Acceptance Criteria

- [ ] `${key:-default}` returns default when key is missing
- [ ] `${key:+alternate}` returns alternate when key exists
- [ ] `${key:?message}` throws with message when key is missing
- [ ] Existing `${key}` behavior unchanged
- [ ] Nested references resolved correctly
- [ ] Tests for all three operators plus edge cases

---

## Issue #24 — Batch Operations

**Title:** Add batch set/delete operations

**Labels:** `enhancement`, `P3`

**Body:**

### Problem

Setting or deleting multiple entries requires separate commands for each key.
This is slow and produces multiple auto-backups.

### Desired Behavior

```
ccli set --batch key1=val1 key2=val2 key3=val3
ccli set --from-file pairs.txt             # file with key=value per line
ccli set --from-json '{"k1":"v1","k2":"v2"}'
ccli delete --batch key1 key2 key3
```

- Batch operations should be atomic (all-or-nothing).
- A single auto-backup is created before the batch, not one per entry.
- A single file-lock is held for the entire batch.

### Relevant Files

- `src/commands/` — set and delete command handlers
- `src/utils/fileLock.ts` — locking
- `src/utils/autoBackup.ts` — backup integration

### Acceptance Criteria

- [ ] `set --batch key=value ...` sets multiple entries atomically
- [ ] `set --from-file` reads key=value pairs from a file
- [ ] `set --from-json` reads from a JSON object
- [ ] `delete --batch key ...` deletes multiple entries atomically
- [ ] Only one auto-backup per batch operation
- [ ] Only one file-lock acquisition per batch
- [ ] MCP `codex_batch_set` and `codex_batch_delete` tools added
- [ ] Tests for all input modes and atomicity

---

## Quick Reference

| Issue | Title | Labels |
|-------|-------|--------|
| 15 | Fish & PowerShell Shell Completions | `enhancement`, `P3`, `good first issue` |
| 16 | `copy`/`cp` Command | `enhancement`, `P3`, `good first issue` |
| 17 | Import Preview / Diff | `enhancement`, `P3` |
| 18 | Advanced Search (Regex, Boolean) | `enhancement`, `P3` |
| 19 | Backup Rotation | `enhancement`, `P3` |
| 20 | Command Output Capture | `enhancement`, `P3` |
| 21 | Change Log / Audit Trail | `enhancement`, `P3` |
| 22 | Fuzzy Finder Integration | `enhancement`, `P3` |
| 23 | Conditional Interpolation | `enhancement`, `P3` |
| 24 | Batch Operations | `enhancement`, `P3` |
