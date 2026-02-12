# Changelog

## 1.2.0 (2026-02-12)

- Added MCP (Model Context Protocol) server for AI agent integration (Claude Code, Claude Desktop)
- New `ccli-mcp` binary exposes 7 tools: codex_add, codex_get, codex_remove, codex_search, codex_alias_set, codex_alias_remove, codex_alias_list
- Added `@modelcontextprotocol/sdk` and `zod` as dependencies

## 1.1.1 (2025-04-15)

- Fixed issue where the alias wasn't displaying correctly on nested levels (#7)
- Added new shortcuts for commands and added examples for how to use them on the help screen

## 1.1.0 (2025-03-15)

- Added new search functionality allowing users to search for entries with flexible matching (#4)
- Fixed the --debug flag not working correctly (#6)

## 1.0.2 (2025-03-10)

- The command "ccli get --tree" now shows associated aliases when using the --tree flag (#2)
- The command "ccli get" now separates keys from values with a colon (#3)

## 1.0.1 (2025-03-04)

Patch release with a bug fix for aliases, better comments, and optimizations

- Fixed bug where aliases weren't properly linking to nested entries
- Simplified and cleaned up comments for better code readability
- Removed scripts directory and unneeded copyBuild.js to reduce package size
- Set removeComments to true in tsconfig for a cleaner /dist folder
- Updated dependencies to latest versions for security and performance

## 1.0.0 (2025-03-04)

Initial release with core functionality:

- Add, get, find, and remove entries with dot notation
- Hierarchical data visualization with tree view
- Alias management for quick access to frequently used entries
- Configuration management
- Import/export capabilities
- Example data initialization
