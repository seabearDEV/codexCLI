# CodexCLI Go Rewrite Plan

A detailed plan for rewriting codexCLI from TypeScript/Node to Go. This document covers everything needed to jump in with minimal friction.

---

## Why Rewrite

| Concern | TypeScript (current) | Go (target) |
|---|---|---|
| Binary size | ~100MB (Node SEA) | ~5-10MB |
| Startup time | ~200-500ms (Node cold start) | <10ms |
| Cross-compilation | Requires per-platform CI runners | `GOOS=linux go build` from any machine |
| Build chain | tsc + esbuild + postject + codesign | `go build` |
| Dependencies at runtime | Embedded Node.js | Zero (static binary) |

---

## Current Codebase Metrics

- **Source**: ~4,400 LOC across 32 files
- **Tests**: ~5,600 LOC across 17 files (450 tests)
- **Commands**: 7 primary + 2 command groups (config, data)
- **Production deps**: 4 (commander, chalk, zod, @modelcontextprotocol/sdk)

---

## Go Tech Stack

| Concern | Package | Why |
|---|---|---|
| CLI framework | `github.com/spf13/cobra` | Industry standard (kubectl, gh, hugo). Built-in dynamic completions for bash/zsh/fish/PowerShell. |
| Terminal styling | `github.com/charmbracelet/lipgloss` | Colors, tree rendering (`lipgloss/tree`), tables, word wrapping. |
| Encryption | Go stdlib (`crypto/aes`, `crypto/cipher`, `crypto/pbkdf2`) | AES-256-GCM + PBKDF2 all in stdlib as of Go 1.24. Zero deps. |
| File locking | `github.com/gofrs/flock` | Cross-platform (flock on Unix, LockFileEx on Windows). |
| Testing | `github.com/rogpeppe/go-internal/testscript` | End-to-end CLI testing via script files. Same framework the Go team uses. |
| Build/release | GoReleaser | Cross-compilation, GitHub releases, Homebrew tap, checksums — single YAML config. |
| MCP (optional) | `github.com/modelcontextprotocol/go-sdk` | Official Go MCP SDK (stable mid-2025). Add later if needed. |

**Total external deps**: ~4 (cobra, lipgloss, flock, go-internal for tests). Everything else is stdlib.

---

## Project Structure

```
codexcli/
├── cmd/
│   └── ccli/
│       └── main.go              # Thin entry point (~20 lines)
├── internal/
│   ├── cli/                     # Cobra command definitions
│   │   ├── root.go              # Root command, persistent flags (--debug)
│   │   ├── set.go               # set / s
│   │   ├── get.go               # get / g
│   │   ├── run.go               # run / r
│   │   ├── find.go              # find / f
│   │   ├── edit.go              # edit / e
│   │   ├── rename.go            # rename / rn
│   │   ├── remove.go            # remove / rm
│   │   ├── config.go            # config subcommands
│   │   ├── data.go              # data export/import/reset
│   │   └── completions.go       # Dynamic completion helpers
│   ├── store/                   # Data storage & dot-path operations
│   │   ├── store.go             # Load/save JSON, mtime caching
│   │   ├── path.go              # Dot-notation get/set/remove on nested maps
│   │   ├── interpolate.go       # ${key} resolution with circular detection
│   │   └── store_test.go
│   ├── crypto/                  # Encryption/decryption
│   │   ├── crypto.go
│   │   └── crypto_test.go
│   ├── format/                  # Output formatting
│   │   ├── flat.go              # key: value display
│   │   ├── tree.go              # Tree display (lipgloss/tree)
│   │   ├── json.go              # JSON output
│   │   └── search.go            # Search result highlighting
│   ├── alias/                   # Alias management
│   │   └── alias.go
│   ├── config/                  # Config management
│   │   └── config.go
│   └── fileutil/                # File utilities
│       ├── atomic.go            # Atomic writes (write tmp + rename)
│       ├── lock.go              # File locking wrapper
│       ├── backup.go            # Auto-backup before destructive ops
│       └── paths.go             # Data dir resolution (dev vs prod)
├── testdata/
│   └── script/                  # testscript .txtar files
│       ├── set.txtar
│       ├── get.txtar
│       ├── run.txtar
│       └── encryption.txtar
├── .goreleaser.yaml
├── go.mod
├── go.sum
└── Makefile
```

---

## Data Compatibility (Critical)

The Go version MUST read/write the same data files so users can switch without data loss.

### Data Directory

```
Priority:
1. $CODEX_DATA_DIR (if set)
2. Dev mode (binary name "cclid"): <project>/data/
3. Production: ~/.codexcli/
```

### File Formats

All files are JSON with 0600 permissions. Directories are 0700.

**entries.json** — nested key-value store:
```json
{
  "server": {
    "ip": "192.168.1.100",
    "production": { "host": "prod.example.com" }
  },
  "api.key": "encrypted::v1:<base64>"
}
```
Type: `map[string]any` where leaves are strings, branches are nested maps.

**aliases.json** — flat alias-to-key mapping:
```json
{ "ip": "server.ip", "sip": "server.production.ip" }
```
Type: `map[string]string`

**config.json** — settings:
```json
{ "colors": true, "theme": "default" }
```
Valid keys: `colors` (bool), `theme` (string: "default", "dark", "light").

**confirm.json** — per-entry confirmation flags:
```json
{ "deploy.cmd": true }
```
Type: `map[string]bool`

### Encryption Format (must match exactly)

```
encrypted::v1:<base64(salt + iv + authTag + ciphertext)>
```

| Component | Size | Notes |
|---|---|---|
| Prefix | 15 bytes | Literal `encrypted::v1:` |
| Salt | 32 bytes | Random, per-entry |
| IV | 12 bytes | Random, standard GCM nonce |
| Auth tag | 16 bytes | GCM authentication tag |
| Ciphertext | variable | AES-256-GCM encrypted |

Key derivation: `PBKDF2-HMAC-SHA256(password, salt, 600_000 iterations, 32-byte key)`

**Go implementation uses only stdlib:**
```go
import (
    "crypto/aes"
    "crypto/cipher"
    "crypto/pbkdf2"   // Go 1.24+
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
)
```

**Critical**: The Go version must produce output identical to the TypeScript version so existing encrypted entries remain readable. Write cross-language test vectors early.

---

## Command Spec

### Primary Commands

| Command | Alias | Args | Key Flags |
|---|---|---|---|
| `set` | `s` | `<key> [value...]` | `-f` force, `-e` encrypt, `-a <alias>`, `-p` prompt, `-c` clear, `--confirm/--no-confirm` |
| `get` | `g` | `[key]` | `-t` tree, `-r` raw, `-s` source, `-d` decrypt, `-c` copy, `-a` aliases, `-j` json |
| `run` | `r` | `<keys...>` | `-y` yes, `--dry`, `-d` decrypt, `--source` |
| `find` | `f` | `<term>` | `-e` entries, `-a` aliases, `-t` tree, `-j` json |
| `edit` | `e` | `<key>` | `-d` decrypt |
| `rename` | `rn` | `<old> <new>` | `-a` alias, `--set-alias <name>` |
| `remove` | `rm` | `<key>` | `-a` alias, `-f` force |

### Command Groups

**`config`**: `set <key> <value>`, `get [key]`, `info`, `examples`, `completions [bash|zsh|install]`

**`data`**: `export <type> [-o FILE] [--pretty]`, `import <type> <file> [-m] [-f]`, `reset <type> [-f]`

Types: `entries`, `aliases`, `confirm`, `all`

### Global Flags

`--debug`, `--version`, `--help`

### Special Behaviors to Preserve

- **Trailing colon stripping**: `server.ip:` → `server.ip`
- **Alias resolution**: alias always wins in key lookup (known limitation)
- **Stdin piping**: `echo "val" | ccli set key` reads from stdin
- **Multiple values**: `ccli set key hello world` → value is `"hello world"`
- **Run chaining**: `ccli run key1 key2` chains with `&&`
- **Run composition**: `ccli run key1:key2` composes into single command
- **Shell wrapper**: `run` uses `--source` + `eval` pattern for `cd`/env changes
- **History exclusion**: `set`/`s` commands excluded from shell history

---

## Interpolation Spec

**Syntax**: `${key_or_alias}` resolved at read time.

**Rules**:
- Regex: `\$\{([^}]+)\}`
- Resolves alias first, then looks up value
- Recursive: resolved values may contain new `${...}` patterns
- Max depth: 10
- Circular detection via visited set → error: `"Circular interpolation detected: a → b → a"`
- Encrypted values cannot be interpolated → error
- Non-string values cannot be interpolated → error
- `--raw` skips interpolation entirely
- `--source` skips interpolation for `get`

---

## Shell Completions

Cobra has built-in dynamic completions via `ValidArgsFunction`. This replaces the entire custom completion engine (601 LOC in TypeScript).

```go
var getCmd = &cobra.Command{
    Use:     "get [key]",
    Aliases: []string{"g"},
    ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]cobra.Completion, cobra.ShellCompDirective) {
        if len(args) != 0 {
            return nil, cobra.ShellCompDirectiveNoFileComp
        }
        keys := store.AllFlatKeys()
        aliases := store.AllAliases()
        var completions []cobra.Completion
        for _, k := range keys {
            completions = append(completions, cobra.Completion{Value: k})
        }
        for name, target := range aliases {
            completions = append(completions, cobra.Completion{
                Value:       name,
                Description: "→ " + target,
            })
        }
        return completions, cobra.ShellCompDirectiveNoFileComp
    },
}
```

Key directives:
- `ShellCompDirectiveNoFileComp` — suppress file completion
- `ShellCompDirectiveNoSpace` — no trailing space (for `set` namespace prefix like `server.`)
- `ShellCompDirectiveKeepOrder` — preserve ordering

Cobra generates scripts for bash, zsh, fish, and PowerShell. Fish/PowerShell support comes free (currently missing from TypeScript version).

---

## Build & Release

Replace the entire SEA build chain + custom GitHub Actions workflow with GoReleaser.

**.goreleaser.yaml:**
```yaml
version: 2
project_name: ccli

builds:
  - main: ./cmd/ccli
    binary: ccli
    env:
      - CGO_ENABLED=0
    goos: [linux, darwin, windows]
    goarch: [amd64, arm64]
    ldflags:
      - -s -w -X main.version={{.Version}} -X main.commit={{.Commit}}

archives:
  - format: tar.gz
    name_template: "{{ .ProjectName }}_{{ .Os }}_{{ .Arch }}"
    format_overrides:
      - goos: windows
        format: zip

brews:
  - repository:
      owner: seabearDEV
      name: homebrew-ccli
      token: "{{ .Env.HOMEBREW_TAP_TOKEN }}"
    homepage: "https://github.com/seabearDEV/codexCLI"
    description: "Command-line information store for quick reference of frequently used data"
    install: |
      bin.install "ccli"
    test: |
      system "#{bin}/ccli", "--version"

checksum:
  name_template: "checksums.txt"
```

**GitHub Actions (`.github/workflows/release.yml`):**
```yaml
name: Release
on:
  push:
    tags: ["v*"]
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-go@v5
        with:
          go-version: "1.24"
      - uses: goreleaser/goreleaser-action@v6
        with:
          version: latest
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
```

This builds all 6 platform/arch combos from a single Ubuntu runner. No more paid macOS runners needed.

---

## Migration Path

### Phase 1: Core CLI (Week 1-2)
1. `go mod init`, project structure, Makefile
2. Store module: load/save JSON, dot-path get/set/remove, mtime caching
3. Alias module: load/save, resolve key
4. Commands: `set`, `get`, `remove` (basic CRUD)
5. Flat output formatting with colors

**Milestone**: `ccli set foo bar && ccli get foo` works with same data files.

### Phase 2: Full Commands (Week 2-3)
1. Commands: `run`, `find`, `edit`, `rename`
2. Config module and `config` subcommands
3. Confirm module
4. `data` subcommands (export/import/reset)
5. Tree output format
6. JSON output format
7. Search highlighting

**Milestone**: All commands functional. Manual testing against existing data.

### Phase 3: Advanced Features (Week 3-4)
1. Encryption (AES-256-GCM + PBKDF2) — cross-language test vectors
2. Interpolation with circular detection
3. File locking and atomic writes
4. Auto-backup before destructive operations
5. Stdin piping, clipboard, pager support
6. Shell wrapper generation + history exclusion
7. `--debug` mode

**Milestone**: Feature parity with TypeScript version.

### Phase 4: Polish & Release (Week 4-5)
1. Cobra dynamic completions for all commands
2. GoReleaser config + CI workflow
3. Integration tests (testscript)
4. Unit tests for store, crypto, interpolation
5. Update README install instructions
6. Cross-language encryption compatibility test
7. `v2.0.0` release

**Milestone**: Production release with all platforms.

### Phase 5: MCP Server (Optional, Later)
1. Separate binary `cmd/ccli-mcp/main.go`
2. Use official Go MCP SDK
3. Port 13 tools from TypeScript MCP server
4. Only do this if there's actual demand

---

## Testing Strategy

### Unit Tests
- Store operations: dot-path get/set/remove, nested maps
- Crypto: encrypt/decrypt round-trip, cross-language vectors, wrong password
- Interpolation: basic, recursive, circular, encrypted ref, max depth
- Alias: resolve, collision, cascade delete

### Command Tests
- Use `cmd.SetOut(&buf)` + `cmd.SetArgs([]string{...})` for each Cobra command
- Assert stdout, stderr, exit codes

### Integration Tests (testscript)
```
# testdata/script/set-get.txtar
exec ccli set server.ip 192.168.1.100
exec ccli get server.ip
stdout '192.168.1.100'
```

### Compatibility Tests
- Write data with TypeScript version, read with Go version (and vice versa)
- Encrypted entries must decrypt correctly across versions
- Alias resolution must match

---

## What We Drop

- **Node SEA build chain**: esbuild, postject, codesign, sea-config.json
- **ts-node, TypeScript compiler**: no longer needed
- **Custom completion engine**: Cobra handles this (saves ~600 LOC)
- **Custom CI matrix**: GoReleaser cross-compiles from single runner

## What We Gain

- Fish and PowerShell completions (free from Cobra)
- 10-20x smaller binaries
- Near-instant startup
- Cross-compile from any machine
- Simpler CI (one runner, one config file)
- No runtime dependencies

---

## Open Questions

1. **Repo strategy**: New repo (`codexcli-go`) or same repo with Go replacing TypeScript?
2. **Binary name**: Keep `ccli` or rename?
3. **Backward compat period**: Ship both versions for a release or hard cutover?
4. **MCP priority**: Build it in Phase 5 or skip until there's demand?
