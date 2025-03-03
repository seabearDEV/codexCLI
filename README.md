# CodexCLI

A command-line information store that allows you to save and retrieve hierarchical data with ease.

## Overview

CodexCLI is a command-line tool designed to help you store, organize, and retrieve structured information efficiently. It uses a hierarchical dot notation system (similar to JSON) that makes it easy to organize related data.

## Features

- **Hierarchical Data Storage**: Store data using intuitive dot notation paths (e.g., `server.production.ip`)
- **Rich Output Formatting**: Color-coded and formatted output for better readability
- **Tree Visualization**: Display nested data in a tree-like structure
- **Aliases**: Create shortcuts to frequently accessed paths
- **Search Capabilities**: Find entries by searching keys or values
- **Development/Production Modes**: Different storage locations based on environment

## Installation

```bash
# Install globally
npm install -g codexcli

# Or install locally
npm install codexcli
```

After installation, you can use the ccli command to interact with CodexCLI.

## Usage

### Basic Commands

```bash
# Add an entry
ccli add server.production.ip 192.168.1.100

# Retrieve an entry
ccli get server.production.ip

# List all entries
ccli list

# List entries under a specific path
ccli list server

# Find entries containing a term
ccli find production

# Remove an entry
ccli remove server.production.ip

# Display help
ccli help
```

### Working with Aliases

Aliases provide shortcuts to frequently used paths:

```bash
# Create an alias
ccli alias set prodip server.production.ip

# Use an alias
ccli get prodip

# List all aliases
ccli alias list

# Remove an alias
ccli alias remove prodip
```

### Display Options

```bash
# Output raw value (useful for scripting)
ccli get server.production.ip --raw

# Display hierarchical data as a tree (aliases are shown in parentheses)
ccli list server --tree
ccli get server --tree
ccli find production --tree
```

### Configuration

```bash
# View a configuration setting
ccli config colorEnabled

# Change a configuration setting
ccli config colorEnabled false
```

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

## Data Storage

- **Development Mode**: Data is stored in the `data` directory within the project
- **Production Mode**: Data is stored in `~/.codexcli` in your home directory

Data directories and files are only created when needed (when adding data, importing data, or running the examples command).

## Example Usage Scenarios

### Server Management

```bash
ccli add server.production.ip 192.168.1.100
ccli add server.production.user admin
ccli add server.staging.ip 192.168.1.200
ccli add server.staging.user testuser
ccli list server
```

### Personal Information

```bash
ccli add personal.contact.email john@example.com
ccli add personal.contact.phone 555-1234
ccli alias set myemail personal.contact.email
ccli get myemail
```

### Debugging

When troubleshooting, you can enable debug output:

```bash
ccli --debug get server.production
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
