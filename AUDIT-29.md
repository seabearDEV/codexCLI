# Performance Audit — Issue #29

**Date:** 2026-04-04
**Branch:** `performance-improvements-for-2026-3-4_29`

Comprehensive audit of the CodexCLI codebase (~14.5k lines, 50 source files) for DRY violations, simplifications, algorithmic complexity, and dead code.

---

## Table of Contents

- [DRY Violations](#dry-violations)
- [Simplifications](#simplifications)
- [Algorithmic Complexity](#algorithmic-complexity)
- [Dead Code](#dead-code)
- [Implementation Plan](#implementation-plan)

---

## DRY Violations

### DRY-1: MCP server re-implements CLI business logic

**Severity:** Critical
**Impact:** ~200 lines of duplication, bug vector (MCP `codex_remove` doesn't cascade-delete confirm metadata)

The `mcp-server.ts` file re-implements core operations instead of calling shared functions from the CLI layer.

| Operation | CLI location | MCP duplicate |
|-----------|-------------|---------------|
| Remove + cascade | `entries.ts:586-594` | `mcp-server.ts:284-291` |
| Copy (subtree) | `entries.ts:597-635` | `mcp-server.ts:308-338` |
| Search | `search.ts:11-40` | `mcp-server.ts:357-389` |
| Alias enforcement | `alias.ts:22-33` | `mcp-server.ts:105-111, 406-411` |
| Import + merge | `data-management.ts:117-155` | `mcp-server.ts:700-753` |
| Export | `data-management.ts:23-65` | `mcp-server.ts:586-605` |
| Reset | `data-management.ts:179-195` | `mcp-server.ts:776-786` |
| Diff/preview | `data-management.ts:200-287` | `mcp-server.ts:639-698` |

**Fix:** Extract a shared operations layer (e.g., `src/operations/`) that both CLI commands and MCP handlers call.

---

### DRY-2: Scope-resolution boilerplate repeated ~8 times

**Severity:** High

The "try project, fall through to global" pattern is copy-pasted across `alias.ts`, `confirm.ts`, and `storage.ts`:

```ts
if (!scope || scope === 'auto') {
  if (findProjectFile()) { /* project */ }
  /* global */
}
```

**Locations:**
- `alias.ts:37-63` (removeAlias)
- `alias.ts:67-95` (renameAlias)
- `alias.ts:100-113` (resolveKey)
- `alias.ts:117-127` (removeAliasesForKey)
- `confirm.ts:31-49` (removeConfirm)
- `confirm.ts:67-75` (removeConfirmForKey)
- `storage.ts:72-83` (getValue)
- `storage.ts:99-120` (removeValue)

**Fix:** Extract `withAutoScope(scope, projectFn, globalFn)` or a similar higher-order helper.

---

### DRY-3: `(scopeParam ?? 'auto') as Scope` repeated 13 times in `mcp-server.ts`

**Severity:** High

**Locations:** `mcp-server.ts` lines 93, 144, 272, 309, 351, 403, 427, 449, 475, 588, 633, 775, 805

**Fix:** Extract `function toScope(s?: string): Scope { return (s ?? 'auto') as Scope; }` at top of file.

---

### DRY-4: CLI_TREE shortcut duplication in `completions.ts`

**Severity:** High
**Impact:** ~100 lines of copy-paste

Every command with a shortcut alias (set/s, get/g, run/r, find/f, copy/cp, edit/e, rename/rn, remove/rm) has its entire `CommandDef` object duplicated verbatim.

**Location:** `completions.ts:90-225`

**Fix:** Define each command once, reference for aliases:
```ts
const setDef: CommandDef = { flags: {...}, argType: 'dataKeyPrefix', description: 'Set an entry' };
const CLI_TREE = { set: setDef, s: setDef, ... };
```

---

### DRY-5: Overwrite-confirmation pattern duplicated

**Severity:** Medium

Identical overwrite-confirmation blocks in `setEntry` and `copyEntry`.

**Locations:**
- `entries.ts:205-215` (setEntry)
- `entries.ts:608-619` (copyEntry)

**Fix:** Extract `async function confirmOverwrite(key, scope, force): Promise<boolean>`.

---

### DRY-6: Subtree copy logic duplicated in `copyEntry` and `renameEntry`

**Severity:** Medium

Both contain identical logic for copying a subtree value (flatten, slice prefix, re-set under new key).

**Locations:**
- `entries.ts:621-629` (copyEntry)
- `entries.ts:673-681` (renameEntry)

**Fix:** Extract `copyValueTree(sourceKey, destKey, value, scope)`.

---

### DRY-7: `removeAliasesFromScope` and `removeConfirmFromScope` are structurally identical

**Severity:** Medium

Both: load a map, build `prefix = key + '.'`, iterate entries, delete matches, conditionally save.

**Locations:**
- `alias.ts:129-142` (removeAliasesFromScope)
- `confirm.ts:77-90` (removeConfirmFromScope)

**Fix:** Extract `removeScopedKeysMatching(key, scope, loadFn, saveFn)`.

---

### DRY-8: `loadMerged` pattern triplicated in `store.ts`

**Severity:** Medium

Three functions do the same project/global merge:

**Locations:**
- `store.ts:198-207` (loadEntriesMerged)
- `store.ts:209-215` (loadAliasMapMerged)
- `store.ts:217-223` (loadConfirmMapMerged)

**Fix:** Extract `mergeSection(section: keyof UnifiedData)`.

---

### DRY-9: Duplicate `toScope`/`resolveScope` helpers

**Severity:** Low

**Locations:**
- `entries.ts:23-25` (toScope)
- `data-management.ts:17-21` (resolveScope)
- `search.ts:83` (inline)

**Fix:** Unify into a single `optionsToScope()` helper in a shared location.

---

### DRY-10: Three identical `clearXxxCache` wrappers

**Severity:** Low

All three call `clearStoreCaches()` and nothing else.

**Locations:**
- `storage.ts:9-11` (clearDataCache)
- `alias.ts:6-8` (clearAliasCache)
- `confirm.ts:6-8` (clearConfirmCache)

**Fix:** Have consumers import `clearStoreCaches` from `store.ts` directly.

---

### DRY-11: Shell RC file detection duplicated

**Severity:** Low

Same shell detection + RC file path logic in two places.

**Locations:**
- `completions.ts:606-618` (installCompletions)
- `commands/info.ts:39-48` (showInfo)

**Fix:** Extract `getShellRcFile(): string | null` utility.

---

### DRY-12: `formatKeyValue` and `displayEntries` both implement word-wrap-with-prefix

**Severity:** Low

**Locations:**
- `formatting.ts:50-73` (formatKeyValue)
- `commands/helpers.ts:35-83` (displayEntries)

**Fix:** Have `displayEntries` call `formatKeyValue` (or a shared lower-level formatter).

---

## Simplifications

### SIMP-1: `formatTree` has 11 positional parameters

**Severity:** High

**Location:** `formatting.ts:269-281`

Call sites are unreadable:
```ts
formatTree(data, keyToAliasMap, '', '', false, false, undefined, false, !showValues, depth)
```

**Fix:** Refactor to an options object:
```ts
interface FormatTreeOptions {
  keyToAliasMap?: Record<string, string>;
  prefix?: string;
  path?: string;
  colorize?: boolean;
  raw?: boolean;
  searchTerm?: string;
  source?: boolean;
  keysOnly?: boolean;
  maxDepth?: number;
  currentDepth?: number;
}
```

---

### SIMP-2: `.replace(/:$/, '')` on key arguments repeated 7 times

**Severity:** Medium

**Location:** `index.ts` lines 74, 122, 146, 174, 205, 220, 243

**Fix:** Extract `stripTrailingColon()` utility, or handle once in `resolveKey()`.

---

### SIMP-3: `err instanceof Error ? err.message : String(err)` repeated 5+ times

**Severity:** Medium

**Locations:**
- `entries.ts:75, 435, 445, 475`
- `mcp-server.ts:500`

`storage.ts` already exports `getErrorMessage()` that does exactly this — but nothing uses it.

**Fix:** Use `getErrorMessage()` consistently across the codebase.

---

### SIMP-4: `EMPTY_DATA` spread is a no-op

**Severity:** Medium

**Location:** `store.ts:53, 73`

```ts
return { ...EMPTY_DATA, entries: {}, aliases: {}, confirm: {} };
```

Every field of `EMPTY_DATA` is overridden, so the spread contributes nothing.

**Fix:** Just `{ entries: {}, aliases: {}, confirm: {} }`, or `{ ...EMPTY_DATA }` if intent is a fresh copy.

---

### SIMP-5: Redundant `typeof target === 'string'` on `Record<string, string>` value

**Severity:** Low

**Location:** `alias.ts:134`

The alias map is typed `Record<string, string>`, so this check is always true.

**Fix:** Remove the `typeof target === 'string'` guard.

---

### SIMP-6: Redundant `setting &&` guard after early return

**Severity:** Low

**Location:** `config-commands.ts:32`

At this point `setting` is guaranteed truthy (the `!setting` case returned on line 19).

**Fix:** `if (!value) {`

---

### SIMP-7: Unreachable `else` branch in MCP codex_get

**Severity:** Low

**Location:** `mcp-server.ts:233`

Value is known not to be an object at this point, and `CodexValue` is `string | object`, so it must be a string. The `else` branch is unreachable.

**Fix:** Remove the `typeof value === 'string'` check, collapse to single branch.

---

### SIMP-8: Verbose `options` passthrough in `find` command

**Severity:** Low

**Location:** `index.ts:188-195`

Manual destructure-and-repack of `options` is unnecessary; Commander's `options` object already has the right shape.

**Fix:** `await withPager(() => commands.searchEntries(term, options));`

---

### SIMP-9: `!!options.raw` / `!!options.source` coercions

**Severity:** Low

**Location:** `entries.ts:297, 312, 322`

Unnecessary when function defaults already handle `undefined`.

**Fix:** Pass `options.raw` and `options.source` directly.

---

### SIMP-10: `loadConfig().colors !== false` when type guarantees boolean

**Severity:** Low

**Location:** `formatting.ts:8-10`

**Fix:** `return loadConfig().colors;`

---

### SIMP-11: `showImportPreview` repeats same 3-section pattern

**Severity:** Low

**Location:** `data-management.ts:232-287`

Entries, aliases, and confirm preview blocks all follow identical structure.

**Fix:** Refactor to a data-driven loop over section definitions.

---

### SIMP-12: Unnecessary alias map copy in `showImportPreview`

**Severity:** Low

**Location:** `data-management.ts:251-254`

`currentFlat` is a pointless clone of `currentAliases` which is already `Record<string, string>`.

**Fix:** Pass `currentAliases` directly to `computeDiff`.

---

### SIMP-13: `.forEach` vs `for...of` inconsistency in search.ts

**Severity:** Low

**Location:** `search.ts:13, 31`

Rest of codebase uses `for...of`. These two use `.forEach`.

**Fix:** Use `for...of` for consistency.

---

### SIMP-14: Redundant `String(targetPath)` when type is already string

**Severity:** Low

**Location:** `search.ts:33, 37`

**Fix:** Remove `String()` wrapper.

---

### SIMP-15: Three redundant `Scope` re-exports

**Severity:** Low

**Locations:** `alias.ts:4`, `confirm.ts:4`, `storage.ts:8`

No consumer imports `Scope` from these paths.

**Fix:** Remove re-exports (addressed also in Dead Code section).

---

### SIMP-16: Verbose error status extraction from `execSync`

**Severity:** Low

**Location:** `entries.ts:119, 128`

```ts
process.exitCode = (err && typeof err === 'object' && 'status' in err ? Number(err.status) : 1) || 1;
```

Appears twice.

**Fix:** Extract `exitCodeFromExecError(err): number`.

---

### SIMP-17: `color` object repeats `isColorEnabled()` in every method

**Severity:** Low

**Location:** `formatting.ts:27-45`

**Fix:** Use a factory function:
```ts
function makeColor(fn: (t: string) => string) {
  return (text: string) => isColorEnabled() ? fn(text) : text;
}
```

---

## Algorithmic Complexity

### ALGO-1: `setValue()` called in a loop for subtree copy/rename — O(L) file writes

**Severity:** Critical

Each iteration does full load + JSON parse + save + file lock. For a subtree with L leaves, that's L complete file I/O cycles.

**Locations:**
- `entries.ts:624-629` (copyEntry)
- `entries.ts:673-681` (renameEntry)
- `mcp-server.ts:327-330` (codex_copy)

**Fix:** Load data once, call `setNestedValue()` for each leaf, save once.

---

### ALGO-2: `removeAlias`/`setAlias` in loop during rename — O(A*4) file I/O

**Severity:** Critical

**Location:** `entries.ts:686-698`

For each alias needing re-pointing: `removeAlias` (load+save) then `setAlias` (load+save+buildKeyToAliasMap). With A matching aliases, that's 4A file operations.

**Fix:** Mutate the loaded aliases object in-place, save once at the end.

---

### ALGO-3: `isColorEnabled()` calls `fs.statSync` on every color function call

**Severity:** High

**Location:** `formatting.ts:8-10`, called from every `color.*()` function (lines 28-45)

Each call triggers `loadConfig()` -> `fs.statSync()` to check mtime. During tree display, color functions can be called hundreds of times. That's hundreds of stat syscalls for a value that cannot change mid-process.

**Fix:** Cache `isColorEnabled` once per process:
```ts
let _colorEnabled: boolean | null = null;
export function isColorEnabled(): boolean {
  if (_colorEnabled === null) _colorEnabled = loadConfig().colors !== false;
  return _colorEnabled;
}
```

---

### ALGO-4: Double `fs.statSync` on cache miss in `store.ts:load()`

**Severity:** Medium

**Location:** `store.ts:53-57`

`existsSync()` does a stat, then `statSync()` does another immediately after.

**Fix:** Single `try { const stat = statSync(filePath); ... } catch { return EMPTY; }`.

---

### ALGO-5: Double sorting on save

**Severity:** Medium

**Location:** `store.ts:82-87`

Aliases and confirm keys are sorted manually, then `saveJsonSorted` sorts top-level keys again redundantly.

**Fix:** Either do recursive sort in one place, or skip `saveJsonSorted` and use `atomicWriteFileSync` directly.

---

### ALGO-6: `buildKeyToAliasMap()` called even for `--json` path

**Severity:** Medium

**Location:** `entries.ts:340-345`

The alias map is built (loading aliases + building inverted map) even when `--json` is specified and the map is never used.

**Fix:** Move `buildKeyToAliasMap()` call below the `--json` early return.

---

### ALGO-7: `removeAliasesForKey` with auto scope always processes both scopes

**Severity:** Medium

**Location:** `alias.ts:117-127`

`removeEntry` already knows which scope the entry was in but doesn't pass it along.

**Fix:** Pass the resolved effective scope downstream.

---

### ALGO-8: `setAlias()` calls `buildKeyToAliasMap()` O(n) on every call

**Severity:** Medium (only problematic in batch contexts)

**Location:** `alias.ts:22-33`

When `setAlias` is called in a loop (as in `renameEntry` or MCP tools), the inverted map is rebuilt each time: O(n*k).

**Fix:** In batch contexts, manipulate the aliases object directly and save once. Standalone `setAlias` is fine.

---

### ALGO-9: `interpolateObject` flattens already-flat data

**Severity:** Low

**Location:** `interpolate.ts:141-160`

Called from `displayFlatEntries` (entries.ts:252-253) with already-flat data.

**Fix:** Add an `interpolateFlat()` variant or skip internal flatten when input is already flat.

---

### ALGO-10: `searchDataEntries` calls `interpolate()` on every entry

**Severity:** Low

**Location:** `search.ts:11-27`

Each `interpolate()` call may trigger store lookups via `resolveKey()` and `getValue()`.

**Fix:** Consider whether search really needs interpolated values, or batch-interpolate with shared cache.

---

### ALGO-11: Extra `statSync` after save for mtime cache

**Severity:** Low

**Location:** `store.ts:88`, `config.ts:78`

**Fix:** Minor; could set from current time instead of re-statting.

---

### ALGO-12: `displayEntries()` re-loads confirm keys

**Severity:** Low

**Location:** `helpers.ts:37`

Triggers 2 additional `statSync` calls (project + global mtime checks).

**Fix:** Accept `confirmKeys` as an optional parameter.

---

## Dead Code

### DEAD-1: `createCachedStore` + entire `cachedStore.ts` module

**Severity:** High — remove entire file

**Location:** `utils/cachedStore.ts`

Never imported by any production or test file. Superseded by `createScopedStore` in `store.ts`.

Also remove its re-export from `utils/index.ts`.

---

### DEAD-2: `handleOperation` function

**Severity:** High — remove

**Location:** `storage.ts:16-23`

Only imported in `__tests__/storage.test.ts`. No production caller.

---

### DEAD-3: `getErrorMessage` function

**Severity:** High — remove (or start using it per SIMP-3)

**Location:** `storage.ts:28`

Only imported in `__tests__/storage.test.ts`. No production caller. However, per SIMP-3, it could be repurposed — either adopt it everywhere or remove it.

---

### DEAD-4: `getDataFilePath` function

**Severity:** High — remove

**Location:** `utils/paths.ts:52-64`

Legacy function from pre-unified-store architecture. Only referenced in test mocks. `store.ts` constructs the path directly.

---

### DEAD-5: `utils/index.ts` barrel file

**Severity:** Medium — remove

**Location:** `utils/index.ts`

Only imported by `__tests__/utils.test.ts`. All production code imports directly from specific util modules.

---

### DEAD-6: Unnecessary `export` keywords (internal-only symbols)

**Severity:** Medium — remove `export`

| Symbol | Location |
|--------|----------|
| `UnifiedData` interface | `store.ts:12` |
| `Config` interface | `config.ts:6` |
| `getEffectiveScope` | `store.ts:147` |
| `acquireLock` | `utils/fileLock.ts:13` |
| `releaseLock` | `utils/fileLock.ts:58` |
| `VALID_THEMES` | `config.ts:11` |
| `saveConfig` | `config.ts:73` |

---

### DEAD-7: Unused `Scope` re-exports

**Severity:** Medium — remove

**Locations:**
- `alias.ts:4` — no consumer imports `Scope` from `./alias`
- `confirm.ts:4` — no consumer imports `Scope` from `./confirm`

---

### DEAD-8: `dataKeyOnly` ArgType — unreachable code

**Severity:** Medium — remove

**Locations:**
- `completions.ts:28` (type definition)
- `completions.ts:343` (case handler)

No command in `CLI_TREE` uses `'dataKeyOnly'` as its `argType`. The case branch is unreachable.

Note: MEMORY.md says "currently unused but available" — confirm if this is intended for future use before removing.

---

### DEAD-9: `EMPTY_DATA` constant — used but has no effect

**Severity:** Medium — remove or fix usage

**Location:** `store.ts:20`

Used on lines 53 and 73 as `{ ...EMPTY_DATA, entries: {}, aliases: {}, confirm: {} }`. Since all three fields are overridden, the spread contributes nothing.

**Fix:** Either use `{ ...EMPTY_DATA }` (for a fresh copy) or remove the constant and use inline literals.

---

### DEAD-10: Color properties only used in tests

**Severity:** Low — keep for symmetry

**Locations:**
- `formatting.ts:36` — `color.italic`
- `formatting.ts:39` — `color.boldColors.cyan`
- `formatting.ts:40` — `color.boldColors.green`
- `formatting.ts:42` — `color.boldColors.blue`

---

### DEAD-11: `clearDataCache`, `clearAliasCache`, `clearConfirmCache` — test-only wrappers

**Severity:** Low — consolidate

**Locations:**
- `storage.ts:9-11`
- `alias.ts:6-8`
- `confirm.ts:6-8`

All three are identical one-line functions calling `clearStoreCaches()`. Only used in test files.

**Fix:** Update tests to import `clearStoreCaches` directly, remove wrappers.

---

### DEAD-12: `clearConfigCache` — test-only export

**Severity:** Low — keep for test support

**Location:** `config.ts:24`

Only imported in test files. Keep as test API.

---

## Implementation Plan

Recommended order, grouped by logical change sets:

### Phase 1: Dead Code Removal (low risk, high clarity)
1. Remove `utils/cachedStore.ts` and its re-export from `utils/index.ts` (DEAD-1, DEAD-5)
2. Remove `handleOperation` from `storage.ts` (DEAD-2)
3. Remove or adopt `getErrorMessage` (DEAD-3 + SIMP-3)
4. Remove `getDataFilePath` from `utils/paths.ts` (DEAD-4)
5. Remove unnecessary `export` keywords (DEAD-6)
6. Remove unused `Scope` re-exports (DEAD-7)
7. Fix `EMPTY_DATA` usage (DEAD-9, SIMP-4)
8. Remove `dataKeyOnly` if confirmed not needed (DEAD-8)
9. Update tests to use `clearStoreCaches` directly, remove wrappers (DEAD-11, DRY-10)

### Phase 2: Algorithmic Fixes (high performance impact)
10. Cache `isColorEnabled` per process (ALGO-3)
11. Batch `setValue` calls in copy/rename (ALGO-1)
12. Batch `removeAlias`/`setAlias` in rename (ALGO-2)
13. Single stat in `store.ts:load()` (ALGO-4)
14. Fix double sorting on save (ALGO-5)
15. Lazy `buildKeyToAliasMap` for `--json` path (ALGO-6)

### Phase 3: DRY Consolidation (architectural improvement)
16. Extract shared operations layer for MCP server (DRY-1)
17. Extract scope-resolution helper (DRY-2, DRY-3, DRY-9)
18. Define CLI_TREE commands once (DRY-4)
19. Extract `confirmOverwrite` helper (DRY-5)
20. Extract `copyValueTree` helper (DRY-6)
21. Extract `removeScopedKeysMatching` (DRY-7)
22. Extract `mergeSection` in store.ts (DRY-8)
23. Extract `getShellRcFile` utility (DRY-11)

### Phase 4: Simplifications (readability)
24. Refactor `formatTree` to options object (SIMP-1)
25. Extract `stripTrailingColon` or handle in `resolveKey` (SIMP-2)
26. Apply remaining low-severity simplifications (SIMP-5 through SIMP-17)

---

## Implementation Status

### Implemented (2026-04-04)

#### Phase 1: Dead Code Removal
- [x] Deleted `utils/cachedStore.ts` and removed re-export from `utils/index.ts` (DEAD-1, DEAD-5)
- [x] Removed `handleOperation` from `storage.ts` (DEAD-2)
- [x] Kept `getErrorMessage` for future use per SIMP-3 (DEAD-3)
- [x] Removed `getDataFilePath` from `utils/paths.ts` (DEAD-4)
- [x] Removed `export` from `UnifiedData`, `getEffectiveScope`, `acquireLock`, `releaseLock`, `Config`, `VALID_THEMES` (DEAD-6)
- [x] Removed unused `Scope` re-exports from `alias.ts` and `confirm.ts` (DEAD-7)
- [x] Fixed `EMPTY_DATA` — removed constant, replaced with inline literals (DEAD-9, SIMP-4)
- [x] Removed `clearDataCache`, `clearAliasCache`, `clearConfirmCache` wrappers; updated tests to use `clearStoreCaches` directly (DEAD-11, DRY-10)
- [x] Removed test mocks for deleted `getDataFilePath` (mcp-server.test.ts, completions.test.ts)

#### Phase 2: Algorithmic Fixes
- [x] Cached `isColorEnabled` per process with `resetColorCache()` for tests (ALGO-3)
- [x] Batched `setValue` calls in `copyEntry` and `renameEntry` — O(L) file writes reduced to 1 (ALGO-1)
- [x] Batched alias operations in `renameEntry` — O(A*4) file I/O reduced to 1 load + 1 save (ALGO-2)
- [x] Single `statSync` in `store.ts:load()` — eliminated double stat on cache miss (ALGO-4)
- [x] Moved `buildKeyToAliasMap()` below `--json` early return in `getEntry` (ALGO-6)

#### Phase 3: DRY Consolidation
- [x] Extracted `toScope()` helper in MCP server — replaced 13 repeated casts (DRY-3)
- [x] Replaced MCP `codex_set` and `codex_alias_set` inline alias enforcement with `setAlias()` (DRY-1 subset)
- [x] Fixed MCP `codex_remove` bug: added `removeConfirmForKey` cascade delete (DRY-1 bug fix)
- [x] Batched `setValue` in MCP `codex_copy` (ALGO-1 for MCP)
- [x] Defined CLI_TREE commands once, referenced for shortcuts — eliminated ~100 lines (DRY-4)

#### Phase 4: Simplifications
- [x] Moved trailing-colon strip into `resolveKey()` — removed 7 repeated `.replace(/:$/, '')` calls (SIMP-2)
- [x] Converted `searchDataEntries` and `searchAliasEntries` from `.forEach` to `for...of` (SIMP-13)
- [x] Removed redundant `String(targetPath)` wrappers in `search.ts` (SIMP-14)
- [x] Removed redundant `typeof target === 'string'` guard in `alias.ts` (SIMP-5)
- [x] Removed redundant `setting &&` guard in `config-commands.ts` (SIMP-6)

### Deferred (lower priority, safe for future PRs)

- SIMP-1: Refactor `formatTree` to options object (high-touch change, many call sites)
- SIMP-3: Use `getErrorMessage()` consistently (requires touching 5+ error handlers)
- DRY-1: Full shared operations layer for MCP server (remaining: search, import, export, reset, diff)
- DRY-2: Extract `withAutoScope` helper (touches 8 functions across 3 files)
- DRY-5: Extract `confirmOverwrite` helper
- DRY-6: Extract `copyValueTree` helper
- DRY-7: Extract `removeScopedKeysMatching` helper
- DRY-8: Extract `mergeSection` in store.ts
- DRY-9: Unify `toScope`/`resolveScope` helpers
- DRY-11: Extract `getShellRcFile` utility
- DRY-12: Unify `formatKeyValue`/`displayEntries` word-wrap logic
- ALGO-5: Fix double sorting on save
- ALGO-7: Pass resolved scope to `removeAliasesForKey`
- ALGO-9 through ALGO-12: Minor algorithmic improvements
- DEAD-8: Remove `dataKeyOnly` (intentionally kept for future use per MEMORY.md)
- SIMP-7 through SIMP-12, SIMP-15 through SIMP-17: Minor simplifications
