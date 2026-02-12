# CodexCLI

A command-line information store for quick reference of frequently used data.

## Overview

CodexCLI is a command-line tool designed to help you store, organize, and retrieve structured information efficiently. It uses a hierarchical dot notation system (similar to JSON) that makes it easy to organize related data.

## Features

- **Hierarchical Data Storage**: Store data using intuitive dot notation paths (e.g., `server.production.ip`)
- **Rich Output Formatting**: Color-coded and formatted output for better readability
- **Tree Visualization**: Display nested data in a tree-like structure
- **Aliases**: Create shortcuts to frequently accessed paths
- **Search Capabilities**: Find entries by searching keys or values
- **MCP Server**: Expose CodexCLI as a tool for AI agents (Claude Code, Claude Desktop) via the Model Context Protocol
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

### Verifying Installation

```bash
# After installation, run:

ccli --version
```

If the command is not found, verify that npm's global bin directory is in your PATH:

```bash
echo $PATH | grep -o "$(npm config get prefix)/bin"

```

After installation, you can use the ccli command to interact with CodexCLI.

## Usage

### Basic Commands

```bash
# Add a simple entry
ccli add mykey "my value"

# Add a nested entry
ccli add server.production.ip 192.168.1.100

# Get a specific entry
ccli get server.production.ip

# Get all entries in a namespace
ccli get server

# Get all entries
ccli get

# Display as a tree structure
ccli get server --tree

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
| `a`      | `add`          | `ccli a server.ip 192.168.1.1`   |
| `f`      | `find`         | `ccli f 192.168`                 |
| `rm`     | `remove`       | `ccli rm server.old`             |
| `al g`   | `alias get`    | `ccli al g`                      |
| `al a`   | `alias add`    | `ccli al a myip server.ip`       |
| `al rm`  | `alias remove` | `ccli al rm myip`                |

### Working with Aliases

Aliases provide shortcuts to frequently used paths:

```bash
# Create an alias
ccli alias add prod-ip server.production.ip

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

| Setting  | Values                  | Description                     |
|----------|-------------------------|---------------------------------|
| `colors` | `true` / `false`        | Enable/disable colored output   |
| `theme`  | `default` / `dark` / `light` | UI theme                  |

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

Data directories and files are only created when needed (when adding data, importing data, or running the examples command).

### Example Usage Scenarios

#### Server Management

```bash
ccli add server.production.ip 192.168.1.100
ccli add server.production.user admin
ccli add server.staging.ip 192.168.1.200
ccli add server.staging.user testuser
ccli get server
```

#### Personal Information

```bash
ccli add personal.contact.email john@example.com
ccli add personal.contact.phone 555-1234
ccli alias add myemail personal.contact.email
ccli get myemail
```

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
| `codex_add` | Add or update an entry (key + value) |
| `codex_get` | Retrieve a specific entry, a subtree, or all entries (flat or tree format) |
| `codex_remove` | Remove an entry by key |
| `codex_search` | Search entries by key, value, or alias (case-insensitive) |
| `codex_alias_set` | Create or update an alias for a dot-notation path |
| `codex_alias_remove` | Remove an alias |
| `codex_alias_list` | List all defined aliases |

### Verifying the MCP Server

You can verify the server starts correctly by sending an MCP `initialize` request:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node dist/mcp-server.js
```

A successful response will include `"serverInfo":{"name":"codexcli"}` in the JSON output.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
