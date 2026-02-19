# CodexCLI

A command-line information store for quick reference of frequently used data.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Basic Commands](#basic-commands)
  - [Shortcuts](#shortcuts)
  - [Working with Aliases](#working-with-aliases)
  - [Display Options](#display-options)
  - [Search Options](#search-options)
  - [Configuration](#configuration)
  - [Storage Backend](#storage-backend)
  - [Data Management](#data-management)
  - [Data Storage](#data-storage)
  - [Shell Wrapper](#shell-wrapper)
  - [Shell Tab-Completion](#shell-tab-completion)
  - [Debugging](#debugging)
- [MCP Server (AI Agent Integration)](#mcp-server-ai-agent-integration)
- [Development](#development)
- [License](#license)

## Overview

CodexCLI is a command-line tool designed to help you store, organize, and retrieve structured information efficiently. It uses a hierarchical dot notation system (similar to JSON) that makes it easy to organize related data.

## Features

- **Hierarchical Data Storage**: Store data using intuitive dot notation paths (e.g., `server.production.ip`)
- **Command Runner**: Execute stored shell commands with confirmation prompts and dry-run support
- **Rich Output Formatting**: Color-coded and formatted output for better readability
- **Tree Visualization**: Display nested data in a tree-like structure
- **Aliases**: Create shortcuts to frequently accessed paths
- **Search Capabilities**: Find entries by searching keys or values
- **MCP Server**: Expose CodexCLI as a tool for AI agents (Claude Code, Claude Desktop) via the Model Context Protocol
- **Shell Tab-Completion**: Full tab-completion for Bash and Zsh (commands, flags, keys, aliases)
- **Development/Production Modes**: Different storage locations based on environment

## Installation

### Prerequisites

Ensure npm's global binaries are in your PATH by adding the following to your shell profile (`.bashrc`, `.zshrc`, or equivalent):

```bash
# Add npm global bin to PATH
export PATH="$(npm config get prefix)/bin:$PATH"
```

### Install from Source

```bash
# Clone the repository
git clone https://github.com/seabearDEV/codexCLI.git

# Navigate to project directory 
cd codexCLI

# Install dependencies
npm install

# Build the package
npm run build

# Install globally on your system
npm install -g .
```

### Post-Install Setup

```bash
# Verify the command is available
ccli --version

# Install shell completions and the shell wrapper (recommended)
ccli completions install

# Reload your shell
source ~/.zshrc   # or ~/.bashrc
```

This installs tab-completion, history exclusion for sensitive commands, and a **shell wrapper** that lets stored commands like `cd`, `export`, and `alias` affect your current shell (see [Shell Wrapper](#shell-wrapper)).

If `ccli` is not found, verify that npm's global bin directory is in your PATH:

```bash
echo $PATH | grep -o "$(npm config get prefix)/bin"
```

## Usage

### Basic Commands

```bash
# Set a simple entry
ccli set mykey "my value"

# Set a nested entry
ccli set server.production.ip 192.168.1.100

# Set a value interactively (use -p to avoid shell expansion of $, !, etc.)
ccli set secret.password -p

# Same, but with visible input
ccli set secret.password -p --show

# Get a specific entry
ccli get server.production.ip

# Get all entries in a namespace
ccli get server

# Get all entries
ccli get

# Display as a tree structure
ccli get server --tree

# Execute a stored command
ccli run my.command

# Execute without confirmation
ccli run my.command -y

# Dry run (print without executing)
ccli run my.command --dry

# Search by key or value
ccli find 192.168.1

# Remove an entry
ccli remove server.production.ip

# Display help
ccli help
```

### Shortcuts

Most commands have short aliases for faster typing:

| Shortcut | Command        | Example                          |
|----------|----------------|----------------------------------|
| `g`      | `get`          | `ccli g server.ip`               |
| `s`      | `set`          | `ccli s server.ip 192.168.1.1`   |
| `r`      | `run`          | `ccli r my.command`              |
| `f`      | `find`         | `ccli f 192.168`                 |
| `rm`     | `remove`       | `ccli rm server.old`             |
| `al g`   | `alias get`    | `ccli al g`                      |
| `al s`   | `alias set`    | `ccli al s myip server.ip`       |
| `al rm`  | `alias remove` | `ccli al rm myip`                |

### Working with Aliases

Aliases provide shortcuts to frequently used paths:

```bash
# Create an alias
ccli alias set prod-ip server.production.ip

# Use the alias
ccli get prod-ip

# View all aliases
ccli alias get
```

### Display Options

```bash
# Output raw value (useful for scripting)
ccli get server.production.ip --raw

# Display hierarchical data as a tree
ccli get server --tree
ccli find production --tree

# When using --tree, aliases are shown in parentheses before the entry value:
# Example output:
# system.commands.getIP (ip): ipconfig getifaddr en0
```

### Search Options

The `find` command supports filtering to narrow your search:

```bash
# Search only in keys
ccli find production --keys-only
ccli find production -k

# Search only in values
ccli find 192.168 --values-only
ccli find 192.168 -v

# Search only in data entries (skip aliases)
ccli find prod --entries-only
ccli find prod -e

# Search only in aliases
ccli find prod --aliases-only
ccli find prod -a
```

### Configuration

```bash
# View all configuration settings
ccli config

# View a specific setting
ccli config colors

# Change a setting
ccli config colors false
ccli config theme dark
```

Available settings:

| Setting   | Values                       | Description                     |
|-----------|------------------------------|---------------------------------|
| `colors`  | `true` / `false`             | Enable/disable colored output   |
| `theme`   | `default` / `dark` / `light` | UI theme                       |
| `backend` | `json` / `sqlite`            | Storage backend                 |

### Storage Backend

CodexCLI supports two storage backends: **JSON** (default) and **SQLite** (via `better-sqlite3`).

To migrate your existing data to SQLite:

```bash
ccli migrate sqlite
```

This copies all data and aliases into a SQLite database and switches the backend automatically.

To migrate back to JSON:

```bash
ccli migrate json
```

If you want to re-run a migration (e.g., after manually editing files), use the `--force` flag:

```bash
ccli migrate sqlite --force
```

You can check which backend is active by running `ccli` with no arguments — the DATA STORAGE section shows the current backend and file paths.

### Data Management

```bash
# Initialize with example data
ccli examples

# Export data to a file
ccli export data -o backup.json

# Export aliases to a file
ccli export aliases -o my-aliases.json

# Export both data and aliases
ccli export all

# Import data from a file (replacing existing)
ccli import data backup.json

# Import and merge with existing data
ccli import data backup.json --merge

# Reset data to empty state
ccli reset data --force

# Reset aliases to empty state
ccli reset aliases --force
```

### Data Storage

- **Development Mode**: Data is stored in the data directory within the project
- **Production Mode**: Data is stored in `~/.codexcli` in your home directory

Data directories and files are only created when needed (when setting data, importing data, or running the examples command).

### Example Usage Scenarios

#### Server Management

```bash
ccli set server.production.ip 192.168.1.100
ccli set server.production.user admin
ccli set server.staging.ip 192.168.1.200
ccli set server.staging.user testuser
ccli get server
```

#### Stored Commands

```bash
ccli set commands.deploy "git push origin main && ssh prod 'deploy.sh'"
ccli set commands.logs "ssh prod 'tail -f /var/log/app.log'"
ccli run commands.deploy          # prompts before executing
ccli run commands.deploy -y       # skip confirmation
ccli run commands.deploy --dry    # print without executing

# Shell builtins work too (requires shell wrapper — see Shell Wrapper section)
ccli set paths.project "cd ~/Projects/my-project"
ccli r paths.project -y           # actually changes your directory
```

#### Personal Information

```bash
ccli set personal.contact.email john@example.com
ccli set personal.contact.phone 555-1234
ccli alias set myemail personal.contact.email
ccli get myemail
```

### Shell Wrapper

By default, `ccli run` executes commands in a child process. This means shell builtins like `cd`, `export`, and `alias` have no effect on your current shell -- the child exits immediately and your working directory stays the same.

After running `ccli completions install`, a shell wrapper function is added to your shell profile that fixes this. When you use `ccli run` (or `ccli r`), the wrapper:

1. Calls the real `ccli` binary with `--source`, which outputs the raw command to stdout instead of executing it
2. Captures that output and `eval`s it in your current shell

All other `ccli` commands pass through to the binary unchanged.

```bash
# Store a navigation command
ccli set paths.myproject "cd ~/Projects/my-project"

# This actually changes your directory (with the wrapper installed)
ccli r paths.myproject -y

# Without the wrapper, cd would run in a child process and have no effect
```

The wrapper is installed automatically by `ccli completions install`. If you already have completions installed, run it again to add the wrapper, then `source` your shell profile.

### Shell Tab-Completion

CodexCLI supports tab-completion for Bash and Zsh, including commands, flags, stored keys, alias names, and more.

#### Quick Setup

```bash
# Auto-detect your shell and install completions + shell wrapper
ccli completions install
```

This appends a completion loader and shell wrapper to your `~/.zshrc` or `~/.bashrc` and tells you to restart your shell (or `source` the file).

#### Manual Setup

If you prefer to set it up yourself:

```bash
# Zsh - add to ~/.zshrc
eval "$(ccli completions zsh)"

# Bash - add to ~/.bashrc or ~/.bash_profile
eval "$(ccli completions bash)"
```

#### What Gets Completed

| Context | Completions |
|---|---|
| `ccli <TAB>` | All commands (`get`, `set`, `find`, `alias`, etc.) |
| `ccli get <TAB>` | Flags + stored data keys + aliases |
| `ccli run <TAB>` | Flags + stored data keys + aliases |
| `ccli export --format <TAB>` | `json`, `yaml`, `text` |
| `ccli alias <TAB>` | Subcommands (`add`, `remove`, `get`) |
| `ccli alias remove <TAB>` | Alias names |
| `ccli export <TAB>` | `data`, `aliases`, `all` |
| `ccli config set <TAB>` | `colors`, `theme` |

### Debugging

When troubleshooting, you can enable debug output:

```bash
ccli --debug get server.production
```

## MCP Server (AI Agent Integration)

CodexCLI includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server, allowing AI agents like Claude Code and Claude Desktop to read and write your CodexCLI data store as a native tool -- no shell commands required.

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

Once connected, the following tools are available to the AI agent:

| Tool | Description |
|---|---|
| `codex_set` | Set an entry in the data store (key + value) |
| `codex_get` | Retrieve a specific entry, a subtree, or all entries (flat or tree format) |
| `codex_remove` | Remove an entry by key |
| `codex_search` | Search entries by key, value, or alias (case-insensitive) |
| `codex_alias_set` | Create or update an alias for a dot-notation path |
| `codex_alias_remove` | Remove an alias |
| `codex_alias_list` | List all defined aliases |
| `codex_run` | Execute a stored command (with optional dry-run mode) |
| `codex_config_get` | Get one or all configuration settings |
| `codex_config_set` | Set a configuration setting (colors, theme) |
| `codex_export` | Export data and/or aliases as JSON text |
| `codex_import` | Import data and/or aliases from a JSON string (merge or replace) |
| `codex_reset` | Reset data and/or aliases to empty state |
| `codex_init_examples` | Initialize example data, aliases, and config |

### Verifying the MCP Server

You can verify the server starts correctly by sending an MCP `initialize` request:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node dist/mcp-server.js
```

A successful response will include `"serverInfo":{"name":"codexcli"}` in the JSON output.

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run in development mode (uses local data directory)
npm run dev
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
