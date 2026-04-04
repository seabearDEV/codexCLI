# CodexCLI

A command-line knowledge base with built-in AI agent integration via MCP.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Storing Data](#storing-data)
  - [Retrieving Data](#retrieving-data)
  - [Running Commands](#running-commands)
  - [Searching](#searching)
  - [Aliases](#aliases)
  - [Copying Data](#copying-data)
  - [Renaming](#renaming)
  - [Editing Data](#editing-data)
  - [Removing Data](#removing-data)
  - [Interpolation](#interpolation)
    - [Conditional Interpolation](#conditional-interpolation)
    - [Exec Interpolation](#exec-interpolation)
  - [Encryption](#encryption)
  - [Configuration](#configuration)
  - [Project-Scoped Data](#project-scoped-data)
  - [Data Management](#data-management)
  - [Shell Wrapper](#shell-wrapper)
  - [Shell Tab-Completion](#shell-tab-completion)
  - [Scripting Tips](#scripting-tips)
  - [Debugging](#debugging)
- [Command Reference](#command-reference)
- [MCP Server (AI Agent Integration)](#mcp-server-ai-agent-integration)
- [Development](#development)
- [License](#license)

## Overview

CodexCLI is a command-line tool and AI agent knowledge base. It stores structured information using hierarchical dot notation (similar to JSON) and exposes it to AI agents via MCP. The goal: make AI agents more effective by giving them persistent, shared project context across sessions.

## Features

- **Hierarchical Data Storage**: Store data using intuitive dot notation paths (e.g., `server.production.ip`)
- **Command Runner**: Execute stored shell commands with dry-run, composition (`:`) and chaining (`&&`), and optional per-entry confirmation
- **Interpolation**: Reference stored values with `${key}`, execute stored commands with `$(key)`, and use conditional defaults `${key:-fallback}` — all resolved at read time
- **Aliases**: Create shortcuts to frequently accessed paths
- **Encryption**: Password-protect sensitive values
- **Search**: Find entries by searching keys or values
- **Tree Visualization**: Display nested data in a tree-like structure
- **Clipboard Integration**: Copy values directly to clipboard (macOS, Linux, Windows)
- **Inline Editing**: Open entries in `$EDITOR` / `$VISUAL` for quick edits
- **JSON Output**: Machine-readable `--json` flag on `get` and `find` for scripting
- **Stdin Piping**: Pipe values into `set` from other commands
- **Project-Scoped Data**: Opt-in `.codexcli.json` per project — project entries take precedence, fall through to global
- **Init Scaffolding**: `ccli init --scaffold` auto-populates from `package.json`, `go.mod`, `Cargo.toml`, or `pyproject.toml`
- **Auto-Backup**: Automatic timestamped backups with configurable rotation (`max_backups` setting)
- **File Locking**: Advisory locking prevents data corruption from concurrent access
- **Shell Tab-Completion**: Full tab-completion for Bash and Zsh (commands, flags, keys, aliases)
- **MCP Server**: 17 tools for AI agents (Claude Code, Claude Desktop) via the Model Context Protocol
- **MCP Telemetry**: Track AI agent usage patterns — bootstrap rate, write-back rate, namespace coverage (`ccli stats`)

## Installation

### Homebrew (macOS / Linux)

```bash
brew tap seabeardev/ccli
brew install ccli
```

### Download Binary

Download the latest release for your platform from [GitHub Releases](https://github.com/seabearDEV/codexCLI/releases/latest).

```bash
# macOS (Apple Silicon)
curl -fsSL https://github.com/seabearDEV/codexCLI/releases/latest/download/ccli-macos-arm64 -o ccli
chmod +x ccli && sudo mv ccli /usr/local/bin/

# macOS (Intel)
curl -fsSL https://github.com/seabearDEV/codexCLI/releases/latest/download/ccli-macos-x64 -o ccli
chmod +x ccli && sudo mv ccli /usr/local/bin/

# Linux (x64)
curl -fsSL https://github.com/seabearDEV/codexCLI/releases/latest/download/ccli-linux-x64 -o ccli
chmod +x ccli && sudo mv ccli /usr/local/bin/

# Linux (ARM64)
curl -fsSL https://github.com/seabearDEV/codexCLI/releases/latest/download/ccli-linux-arm64 -o ccli
chmod +x ccli && sudo mv ccli /usr/local/bin/

# Windows (x64) — download from:
# https://github.com/seabearDEV/codexCLI/releases/latest/download/ccli-win-x64.exe

# First run will prompt to install shell completions
ccli
```

### Install from Source

> **Note:** Installing from source registers the development binary `cclid` (not `ccli`). All examples in this README use `ccli`, but substitute `cclid` if you installed from source. The production `ccli` binary is available via Homebrew or the GitHub Releases download above.

Ensure npm's global binaries are in your PATH by adding the following to your shell profile (`.bashrc`, `.zshrc`, or equivalent):

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

```bash
git clone https://github.com/seabearDEV/codexCLI.git
cd codexCLI
npm install
npm run build
npm install -g .
```

If `cclid` is not found after installing, verify that npm's global bin directory is in your PATH:

```bash
echo $PATH | grep -o "$(npm config get prefix)/bin"
```

## Usage

### Storing Data

```bash
# Set a simple entry
ccli set mykey "my value"

# Set a nested entry using dot notation
ccli set server.production.ip 192.168.1.100

# Set with an alias
ccli set server.production.ip 192.168.1.100 -a ip

# Overwrite without confirmation
ccli set server.production.ip 10.0.0.1 -f

# Read value interactively (avoids shell expansion of $, !, etc.)
ccli set secret.token -p

# Same, but with visible input
ccli set secret.token -p --show

# Encrypt a value
ccli set api.key sk-secret-123 -e

# Mark an entry as requiring confirmation before running
ccli set commands.deploy "./deploy.sh" --confirm

# Remove the confirmation requirement from an entry
ccli set commands.deploy --no-confirm

# Batch set multiple key=value pairs
ccli set a=1 b=2 c=3

# Pipe a value from stdin
echo "my value" | ccli set mykey

# Pipe from another command
curl -s https://api.example.com/token | ccli set api.token
```

After setting an entry, you'll be asked interactively whether it should require confirmation to run. Use `--confirm` or `--no-confirm` to skip the prompt.

### Retrieving Data

When inside a project directory (one with a `.codexcli.json`), `get` shows project entries by default. Use `-G` for global entries or `-A` for both. Outside a project, `get` shows global entries. Looking up a specific key always falls through from project to global automatically.

```bash
# List keys in the current scope
ccli get

# List keys with values
ccli get -v

# Get a specific entry (leaf values always show their value)
ccli get server.production.ip

# List keys in a namespace
ccli get server

# List keys in a namespace with values
ccli get server -v

# Show global entries only (when inside a project)
ccli get -G

# Show entries from all scopes with section headers
ccli get -A

# Limit key depth (1 = top-level, 2 = two levels, etc.)
ccli get -k 1
ccli get -k 2 -v           # two levels with values

# Display as a tree structure (keys only by default)
ccli get --tree
ccli get --tree --values   # tree with values
ccli get --tree -k 2       # tree limited to 2 levels

# Output raw value without colors (for scripting)
ccli get server.production.ip --raw

# Show stored value before interpolation
ccli get paths.myproject --source

# Decrypt an encrypted value
ccli get api.key -d

# Copy value to clipboard
ccli get server.ip -c

# Output as JSON (for scripting)
ccli get server --json

# Show aliases only
ccli get -a
```

### Running Commands

Commands run immediately by default. Entries marked with `--confirm` at set time will prompt before executing. Use `-y` to skip the prompt.

```bash
# Execute a stored command (runs immediately unless marked --confirm)
ccli run deploy.cmd

# Skip the confirmation prompt (for entries marked --confirm)
ccli run deploy.cmd -y

# Dry run (print without executing)
ccli run deploy.cmd --dry

# Chain multiple commands with &&
ccli run nav.project commands.list -y
# → cd /path/to/project && ls -l

# Compose a command from fragments using :
ccli run commands.cd:paths.project -y
# → cd /path/to/project

# Combine composition and chaining
ccli run commands.cd:paths.project commands.list -y
# → cd /path/to/project && ls -l

# Multiple colon-separated segments
ccli run commands.scp:files.config:targets.prod -y
# → scp ./config.yml admin@prod:/etc/app/

# Decrypt and run an encrypted command
ccli run secret.script -d -y

# Capture output for piping (instead of inheriting stdio)
ccli run cmd.echo --capture | tr a-z A-Z
```

### Searching

```bash
# Search keys and values
ccli find 192.168

# Search data entries only (skip aliases)
ccli find prod -e

# Search aliases only
ccli find ip -a

# Show results as a tree
ccli find server -t

# Output as JSON (for scripting)
ccli find prod --json
```

### Aliases

Aliases are shortcuts to frequently used key paths. They're managed through the `set`, `get`, and `remove` commands:

```bash
# Create an entry with an alias
ccli set server.production.ip 192.168.1.100 -a ip

# Add/change an alias on an existing entry (no value needed)
ccli set server.production.ip -a sip

# Use an alias anywhere you'd use a key
ccli get ip
ccli run ip

# List all aliases
ccli get -a

# Remove an alias only (keep the entry)
ccli remove ip -a

# Remove an entry and its alias
ccli remove server.production.ip
```

### Copying Data

Copy an entry (or an entire subtree) to a new key:

```bash
# Copy a single entry
ccli copy server.ip server.ip.backup

# Copy an entire subtree
ccli copy server server.backup

# Overwrite destination without confirmation
ccli cp server.ip server.ip.backup -f
```

### Renaming

Rename entry keys or aliases without re-creating them:

```bash
# Rename an entry key (moves the value, updates aliases)
ccli rename server.old server.new

# Rename an alias
ccli rename -a oldalias newalias

# Rename a key and set a new alias on it
ccli rename server.old server.new --set-alias sn
```

### Editing Data

Open a stored value in your `$EDITOR` (or `$VISUAL`) for inline editing:

```bash
# Edit an entry in your default editor
ccli edit server.production.ip

# Edit an encrypted entry (decrypts before editing, re-encrypts on save)
ccli edit api.key --decrypt
```

### Removing Data

Removing an entry prompts for confirmation. Use `-f` to skip.

```bash
# Remove an entry (prompts for confirmation)
ccli remove server.old

# Remove without confirmation
ccli remove server.old -f

# Remove an alias only (keep the entry)
ccli remove myalias -a
```

### Interpolation

Reference stored values inside other values with `${key}` syntax. References are resolved at read time.

```bash
# Store a base path
ccli set paths.github "/Users/me/Projects/github.com"

# Reference it in another entry
ccli set paths.myproject 'cd ${paths.github}/myproject'

# Resolves at read time
ccli get paths.myproject
# → cd /Users/me/Projects/github.com/myproject

# Works with run too
ccli run paths.myproject -y

# Use --source to see the raw stored value
ccli get paths.myproject --source

# Use --prompt (-p) when setting to avoid shell expansion of ${}
ccli set paths.myproject -p
```

#### Conditional Interpolation

Use bash-style modifiers for fallback values and required-key checks:

```bash
# Default value — use fallback when key is not found
ccli set greeting 'Hello, ${user.name:-stranger}!'
ccli get greeting
# → Hello, stranger!    (if user.name doesn't exist)
# → Hello, Alice!       (if user.name is "Alice")

# Required value — throw a custom error when key is not found
ccli set deploy.cmd 'ssh ${deploy.host:?deploy.host must be set first}'
ccli run deploy.cmd
# → Error: deploy.host must be set first

# Nested defaults — the fallback can itself contain ${} references
ccli set url '${api.url:-${api.default_url}}/endpoint'

# Empty default — resolves to empty string when key is missing
ccli set optional '${maybe.key:-}'
```

#### Exec Interpolation

Use `$(key)` to execute a stored command and substitute its stdout. The key must reference a stored string value containing a shell command.

```bash
# Store a command
ccli set system.user "whoami"

# Reference it with $(key) — executes the command and substitutes the output
ccli set paths.home '/Users/$(system.user)'

ccli get paths.home
# → /Users/kh

# See the raw value without executing
ccli get paths.home --source
# → /Users/$(system.user)

# Aliases work too
ccli set system.user -a user
ccli set paths.home '/Users/$(user)'
```

Exec interpolation supports:

- **Recursion**: stored commands can contain `${key}` or `$(key)` references that resolve before execution
- **Caching**: the same key is only executed once per interpolation pass
- **Circular detection**: `$(a)` → `$(b)` → `$(a)` throws an error
- **Timeout**: commands are killed after 10 seconds
- **Cross-type references**: `${key}` values can contain `$(key)` and vice versa

### Encryption

```bash
# Encrypt a value (prompts for password twice)
ccli set api.key sk-secret-123 -e

# Encrypted values show as [encrypted]
ccli get api.key
# → api.key: [encrypted]

# Decrypt to view
ccli get api.key -d

# Decrypt and copy to clipboard
ccli get api.key -d -c

# Decrypt and run
ccli run secret.deploy -d -y

# Clear terminal after setting sensitive data
ccli set api.key -p -e -c
```

### Configuration

```bash
# Show all settings
ccli config

# Get a specific setting
ccli config get theme

# Change a setting
ccli config set theme dark
ccli config set colors false

# Show version, stats, and storage paths
ccli config info

# Show usage examples
ccli config examples
```

Available settings:

| Setting       | Values                       | Description                                      |
|---------------|------------------------------|--------------------------------------------------|
| `colors`      | `true` / `false`             | Enable/disable colored output                    |
| `theme`       | `default` / `dark` / `light` | UI theme                                         |
| `max_backups` | integer (default: `10`)      | Number of auto-backups to keep (`0` to disable)  |

### Project-Scoped Data

CodexCLI supports per-project data files that live alongside your code. The `.codexcli.json` file is designed to be committed to version control, creating a shared knowledge base that persists across sessions, team members, and AI agents.

```bash
# Initialize a project data file in the current directory
ccli init

# Initialize and auto-populate from project files (package.json, go.mod, etc.)
ccli init --scaffold

# Store project knowledge
ccli set commands.build "npm run build"
ccli set commands.test "npm test"
ccli set arch.api "REST endpoints in src/routes/, validated by Zod schemas"
ccli set conventions.errors "Always use AppError class from src/utils/errors.ts"
ccli set context.auth "JWT tokens expire after 1h, refresh via /api/refresh"

# get shows project entries only (when inside a project)
ccli get

# Single-key lookups fall through to global transparently
ccli get paths.github    # not in project → found in global

# Use -G to see global entries only
ccli get -G

# Use -A to see both scopes with section headers
ccli get -A

# Use -G to explicitly write to global while inside a project
ccli set server.ip 192.168.1.100 -G

# Remove the project file
ccli init --remove
```

**Scope flags:** The `-G` / `--global` flag is available on `set`, `get`, `run`, `find`, `copy`, `edit`, `rename`, and `remove`. Data management commands (`export`, `import`, `reset`) also support `-P` / `--project`.

#### Recommended Schema

When using CodexCLI as a project knowledge base (especially with AI agents via MCP), we recommend organizing entries under these namespaces:

| Namespace | Purpose | Examples |
|---|---|---|
| `project.*` | Basic metadata | `project.name`, `project.stack`, `project.description` |
| `commands.*` | Build, test, deploy commands | `commands.build`, `commands.test`, `commands.deploy.staging` |
| `arch.*` | Architecture and design decisions | `arch.storage`, `arch.api`, `arch.auth` |
| `conventions.*` | Coding patterns, naming, style | `conventions.types`, `conventions.errors`, `conventions.testing` |
| `context.*` | Non-obvious gotchas, edge cases | `context.migration`, `context.legacy`, `context.performance` |
| `files.*` | Key file paths and their roles | `files.entry`, `files.config`, `files.routes` |
| `deps.*` | Notable dependencies and why | `deps.commander`, `deps.vitest`, `deps.zod` |

Keep values concise — one sentence or a short command. Use multiple keys under the same namespace for detail. Don't store things easily derived from `package.json` or the code itself; store insights, decisions, and context that would otherwise be lost.

#### AI Agent Workflow

When an AI agent connects via MCP, the recommended workflow is:

1. Call `codex_context` as your **first** tool call to load all stored project knowledge
2. Check relevant namespaces (`arch`, `conventions`, `context`) before exploring the codebase
3. Record non-obvious discoveries with `codex_set` as you work
4. Update stale entries when you find they no longer match the code

Agent usage is tracked automatically — run `ccli stats` to see bootstrap rate, write-back rate, and namespace coverage trends.

### Data Management

All data (entries, aliases, confirm metadata) is stored in a single `data.json` file — `~/.codexcli/data.json` for global data, `.codexcli.json` for project-scoped data.

```bash
# Export data to a timestamped file
ccli data export entries

# Export to a specific file
ccli data export aliases -o my-aliases.json

# Export with pretty-printed JSON
ccli data export entries --pretty

# Export confirm metadata
ccli data export confirm

# Export everything (entries, aliases, confirm metadata)
ccli data export all

# Export only global data (when a project file exists)
ccli data export entries -G

# Import data from a file (replaces existing)
ccli data import entries backup.json

# Import and merge with existing data
ccli data import entries backup.json --merge

# Preview changes without importing
ccli data import entries backup.json --merge --preview

# Reset data to empty state (prompts first)
ccli data reset entries

# Reset without confirmation
ccli data reset all -f
```

> **Auto-backup:** Before destructive operations (`data reset`, non-merge `data import`), CodexCLI automatically creates a timestamped backup in `~/.codexcli/.backups/`. The last 10 backups are kept by default — configure with `ccli config set max_backups <n>` (set to `0` to disable rotation).

### Shell Wrapper

By default, `ccli run` executes commands in a child process. This means shell builtins like `cd`, `export`, and `alias` have no effect on your current shell.

After running `ccli config completions install`, a shell wrapper function is added to your shell profile that fixes this. When you use `ccli run` (or `ccli r`), the wrapper:

1. Calls the real `ccli` binary with `--source`, which outputs the raw command to stdout instead of executing it
2. Captures that output and `eval`s it in your current shell

All other `ccli` commands pass through to the binary unchanged.

```bash
# Store a navigation command
ccli set paths.myproject 'cd ~/Projects/my-project'

# This actually changes your directory (with the wrapper installed)
ccli r paths.myproject -y

# Without the wrapper, cd would run in a child process and have no effect
```

The wrapper is installed automatically by `ccli config completions install`. If you already have completions installed, run it again to add the wrapper, then `source` your shell profile.

### Shell Tab-Completion

CodexCLI supports tab-completion for Bash and Zsh, including commands, flags, stored keys, alias names, and more.

#### Quick Setup

```bash
ccli config completions install
```

This appends a completion loader and shell wrapper to your `~/.zshrc` or `~/.bashrc` and tells you to restart your shell (or `source` the file).

#### Manual Setup

If you prefer to set it up yourself:

```bash
# Zsh - add to ~/.zshrc
eval "$(ccli config completions zsh)"

# Bash - add to ~/.bashrc or ~/.bash_profile
eval "$(ccli config completions bash)"
```

#### What Gets Completed

| Context | Completions |
|---|---|
| `ccli <TAB>` | All commands (`set`, `get`, `run`, `find`, `edit`, `copy`, `remove`, `rename`, `init`, `stats`, `config`, `data`) |
| `ccli get <TAB>` | Flags + stored data keys + aliases + namespace prefixes |
| `ccli run <TAB>` | Flags + stored data keys + aliases |
| `ccli run cd:<TAB>` | Data keys + aliases (completes the segment after `:`) |
| `ccli set <TAB>` | Flags + namespace prefixes (one level at a time) |
| `ccli config <TAB>` | Subcommands (`set`, `get`, `info`, `examples`, `completions`) |
| `ccli config set <TAB>` | Config keys (`colors`, `theme`, `max_backups`) |
| `ccli data <TAB>` | Subcommands (`export`, `import`, `reset`) |
| `ccli data export <TAB>` | `entries`, `aliases`, `confirm`, `all` |

### Scripting Tips

```bash
# Use raw output in other commands
ssh $(ccli get server.ip -r)

# Decrypt and copy to clipboard
ccli get api.key -d -c

# Decrypt and run without prompt
ccli run deploy.cmd -d -y

# Preview a command with interpolation
ccli run paths.myproject --dry -y
```

### Debugging

```bash
ccli --debug get server.production
```

## Command Reference

| Command | Alias | Signature | Description |
|---|---|---|---|
| `set` | `s` | `<key> [value]` | Set an entry (value optional with `-a`; supports `key=val` batch) |
| `get` | `g` | `[key]` | List keys (default) or retrieve entries with `-v` |
| `run` | `r` | `<keys...>` | Execute stored command(s) (`:` compose, `&&` chain) |
| `find` | `f` | `<term>` | Find entries by key or value |
| `edit` | `e` | `<key>` | Open an entry's value in `$EDITOR` |
| `copy` | `cp` | `<source> <dest>` | Copy an entry to a new key |
| `remove` | `rm` | `<key>` | Remove an entry and its alias |
| `rename` | `rn` | `<old> <new>` | Rename an entry key or alias |
| `config` | | `<subcommand>` | View or change configuration settings |
| `init` | | | Create project-scoped `.codexcli.json` (`--scaffold` to auto-populate) |
| `stats` | | | View MCP usage telemetry and trends (`--period`, `--json`) |
| `data` | | `<subcommand>` | Manage stored data (export, import, reset) |

**Config subcommands:** `set <key> <value>`, `get [key]`, `info`, `examples`, `completions <bash\|zsh\|install>`

**Data subcommands:** `export <type>`, `import <type> <file>`, `reset <type>`

**Scope flags:** `-G` / `--global` targets the global store. `-A` / `--all` on `get` shows both scopes with section headers.

## MCP Server (AI Agent Integration)

CodexCLI includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server, allowing AI agents like Claude Code and Claude Desktop to read and write your CodexCLI data store as a native tool.

### Setup

#### Claude Code

**Homebrew / binary install (global):**

```bash
claude mcp add codexcli -- ccli mcp-server
```

**Per-project** (recommended — enables project-scoped data):

```bash
claude mcp add codexcli --scope project -- ccli mcp-server --cwd .
```

The `--scope project` makes the registration per-project in Claude Code, and `--cwd .` tells the MCP server to use the project root for `.codexcli.json` detection. You can also use the `CODEX_PROJECT_DIR` environment variable instead of `--cwd`.

**npm global install** (`npm install -g .`) — dev mode:

```bash
claude mcp add codexcli -- cclid mcp-server
```

**From source** (development):

```bash
claude mcp add codexcli -- node /absolute/path/to/dist/mcp-server.js
```

> The standalone `cclid-mcp` command also still works for npm installs.

#### Claude Desktop

**Homebrew / binary install:**

```json
{
  "mcpServers": {
    "codexcli": {
      "command": "ccli",
      "args": ["mcp-server"]
    }
  }
}
```

**npm global install** (dev mode):

```json
{
  "mcpServers": {
    "codexcli": {
      "command": "cclid",
      "args": ["mcp-server"]
    }
  }
}
```

**From source:**

```json
{
  "mcpServers": {
    "codexcli": {
      "command": "node",
      "args": ["/absolute/path/to/dist/mcp-server.js"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|---|---|
| `codex_set` | Set an entry (key + value, optional alias, optional encrypt + password) |
| `codex_get` | Retrieve entries (specific key, subtree, or all; optional decrypt + password) |
| `codex_remove` | Remove an entry or alias by key |
| `codex_copy` | Copy an entry to a new key (optional force to overwrite) |
| `codex_rename` | Rename an entry key or alias (re-points aliases, migrates confirm metadata) |
| `codex_search` | Search entries by key or value (case-insensitive) |
| `codex_alias_set` | Create or update an alias for a dot-notation path |
| `codex_alias_remove` | Remove an alias |
| `codex_alias_list` | List all defined aliases |
| `codex_run` | Execute a stored command (dry-run, force to skip confirm check, capture output) |
| `codex_config_get` | Get one or all configuration settings |
| `codex_config_set` | Set a configuration setting (colors, theme, max_backups) |
| `codex_export` | Export data and/or aliases as JSON text |
| `codex_import` | Import data and/or aliases from a JSON string (merge, replace, or preview) |
| `codex_reset` | Reset data and/or aliases to empty state |
| `codex_context` | Compact summary of all stored project knowledge (use at session start) |
| `codex_stats` | View MCP usage telemetry and AI agent effectiveness metrics |

All data-touching tools accept an optional `scope` parameter (`"project"` or `"global"`). When listing entries (no key), `codex_get` defaults to project-only if a `.codexcli.json` exists — pass `all: true` to see both scopes. Single-key lookups fall through from project to global automatically.

### LLM Instructions

When an AI agent connects via MCP, CodexCLI sends built-in instructions that guide how the agent interacts with the data store (schema, scope, tool tips, effective usage patterns). These defaults are immutable and stay up to date as features are added.

To add project-specific guidance, set `system.llm.instructions` — your text is **appended** to the defaults as a `PROJECT CONTEXT` section, not a replacement:

```bash
# Add project-specific instructions for AI agents
ccli set system.llm.instructions "This is a monorepo. Always check arch.modules before modifying shared code. Never store secrets, even encrypted."

# View the effective instructions (defaults + your additions)
ccli config llm-instructions

# View just the built-in defaults
ccli config llm-instructions --default

# Remove your custom additions (reverts to defaults only)
ccli rm system.llm.instructions
```

### Verifying the MCP Server

```bash
# Binary / Homebrew install:
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | ccli mcp-server

# From source:
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node dist/mcp-server.js
```

A successful response will include `"serverInfo":{"name":"codexcli"}` in the JSON output.

## Development

```bash
npm install        # Install dependencies
npm run build      # Build the project
npm test           # Run all tests
npm run test:watch # Run tests in watch mode
npm run dev:watch  # Watch mode — recompiles on file changes
npm run lint       # Run ESLint
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
