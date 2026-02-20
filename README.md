# CodexCLI

A command-line information store for quick reference of frequently used data.

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
  - [Renaming](#renaming)
  - [Removing Data](#removing-data)
  - [Interpolation](#interpolation)
  - [Encryption](#encryption)
  - [Configuration](#configuration)
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

CodexCLI is a command-line tool designed to help you store, organize, and retrieve structured information efficiently. It uses a hierarchical dot notation system (similar to JSON) that makes it easy to organize related data.

## Features

- **Hierarchical Data Storage**: Store data using intuitive dot notation paths (e.g., `server.production.ip`)
- **Command Runner**: Execute stored shell commands with dry-run, composition (`:`) and chaining (`&&`), and optional per-entry confirmation
- **Interpolation**: Reference stored values inside other values with `${key}` syntax
- **Aliases**: Create shortcuts to frequently accessed paths
- **Encryption**: Password-protect sensitive values
- **Search**: Find entries by searching keys or values
- **Tree Visualization**: Display nested data in a tree-like structure
- **Clipboard Integration**: Copy values directly to clipboard
- **Shell Tab-Completion**: Full tab-completion for Bash and Zsh (commands, flags, keys, aliases)
- **MCP Server**: Expose CodexCLI as a tool for AI agents (Claude Code, Claude Desktop) via the Model Context Protocol

## Installation

### Download Binary (Recommended)

Download the latest release for your platform from [GitHub Releases](https://github.com/seabearDEV/codexCLI/releases/latest).

```bash
# macOS (Apple Silicon)
curl -fsSL https://github.com/seabearDEV/codexCLI/releases/latest/download/ccli-darwin-arm64 -o ccli
chmod +x ccli
sudo mv ccli /usr/local/bin/

# First run will prompt to install shell completions
ccli
```

### Install from Source

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

If `ccli` is not found after installing, verify that npm's global bin directory is in your PATH:

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
```

After setting an entry, you'll be asked interactively whether it should require confirmation to run. Use `--confirm` or `--no-confirm` to skip the prompt.

### Retrieving Data

```bash
# Get a specific entry
ccli get server.production.ip

# Get all entries in a namespace
ccli get server

# Get all entries
ccli get

# Display as a tree structure
ccli get server --tree

# Output raw value without colors (for scripting)
ccli get server.production.ip --raw

# Show stored value before interpolation
ccli get paths.myproject --source

# Decrypt an encrypted value
ccli get api.key -d

# Copy value to clipboard
ccli get server.ip -c

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

| Setting  | Values                       | Description                   |
|----------|------------------------------|-------------------------------|
| `colors` | `true` / `false`             | Enable/disable colored output |
| `theme`  | `default` / `dark` / `light` | UI theme                      |

### Data Management

```bash
# Export data to a timestamped file
ccli data export entries

# Export to a specific file
ccli data export aliases -o my-aliases.json

# Export everything
ccli data export all -o backup.json

# Import data from a file (replaces existing)
ccli data import entries backup.json

# Import and merge with existing data
ccli data import entries backup.json --merge

# Reset data to empty state (prompts first)
ccli data reset entries

# Reset without confirmation
ccli data reset all -f
```

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
| `ccli <TAB>` | All commands (`set`, `get`, `run`, `find`, `remove`, `rename`, `config`, `data`) |
| `ccli get <TAB>` | Flags + stored data keys + aliases |
| `ccli run <TAB>` | Flags + stored data keys + aliases |
| `ccli set <TAB>` | Flags + namespace prefixes (one level at a time) |
| `ccli config <TAB>` | Subcommands (`set`, `get`, `info`, `examples`, `completions`) |
| `ccli config set <TAB>` | Config keys (`colors`, `theme`) |
| `ccli data export <TAB>` | `entries`, `aliases`, `all` |

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
| `set` | `s` | `<key> [value]` | Set an entry (value optional with `-a`) |
| `get` | `g` | `[key]` | Retrieve entries or specific data |
| `run` | `r` | `<keys...>` | Execute stored command(s) (`:` compose, `&&` chain) |
| `find` | `f` | `<term>` | Find entries by key or value |
| `remove` | `rm` | `<key>` | Remove an entry and its alias |
| `rename` | `rn` | `<old> <new>` | Rename an entry key or alias |
| `config` | | `[setting] [value]` | View or change configuration settings |
| `data` | | `<subcommand>` | Manage stored data (export, import, reset) |

**Config subcommands:** `info`, `examples`, `completions <bash\|zsh\|install>`

**Data subcommands:** `export <type>`, `import <type> <file>`, `reset <type>`

## MCP Server (AI Agent Integration)

CodexCLI includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server, allowing AI agents like Claude Code and Claude Desktop to read and write your CodexCLI data store as a native tool.

### Setup

#### Claude Code

```bash
claude mcp add codexcli -- node /absolute/path/to/dist/mcp-server.js
```

If you installed CodexCLI globally, you can also use:

```bash
claude mcp add codexcli -- ccli-mcp
```

#### Claude Desktop

Add the following to your Claude Desktop MCP config file:

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
| `codex_set` | Set an entry in the data store (key + value, optional alias) |
| `codex_get` | Retrieve entries (specific key, subtree, or all; flat or tree format) |
| `codex_remove` | Remove an entry or alias by key |
| `codex_search` | Search entries by key or value (case-insensitive) |
| `codex_alias_set` | Create or update an alias for a dot-notation path |
| `codex_alias_remove` | Remove an alias |
| `codex_alias_list` | List all defined aliases |
| `codex_run` | Execute a stored command (with optional dry-run mode) |
| `codex_config_get` | Get one or all configuration settings |
| `codex_config_set` | Set a configuration setting (colors, theme) |
| `codex_export` | Export data and/or aliases as JSON text |
| `codex_import` | Import data and/or aliases from a JSON string (merge or replace) |
| `codex_reset` | Reset data and/or aliases to empty state |

### Verifying the MCP Server

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node dist/mcp-server.js
```

A successful response will include `"serverInfo":{"name":"codexcli"}` in the JSON output.

## Development

```bash
npm install        # Install dependencies
npm run build      # Build the project
npm test           # Run all tests
npm run test:watch # Run tests in watch mode
npm run dev        # Run in development mode (uses local data directory)
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
