# Changelog

## 1.1.1 (2025-04-15)

- ✅ Fixing issue where the alias wasn't displaying correctly on nested levels. (#7)
- ✅ Added new shortcuts for commands and added examples for how to use them on the help screen


## 1.1.0 (2025-03-15)

- ✅ Added new search functionality allowing users to search for entries with flexible matching (#4)
- ✅ The --debug flag isn't working correctly (#6)

## 1.0.2 (2025-03-10)

- ✅ The command "ccli get --tree" now shows associated aliases when using the --tree flag (#2)
- ✅ The command "ccli get" now separates keys from values with a colon (#3)

## 1.0.1 (2025-03-04)

Patch release with a bug fix for aliases, better comments, and optimizations

- ✅ Fixed bug where aliases weren't properly linking to nested entries
- ✅ Simplified and cleaned up comments for better code readability
- ✅ Removed scripts directory and unneeded copyBuild.js to reduce package size
- ✅ Set removeComments to true in tsconfig for a cleaner /dist folder
- ✅ Updated dependencies to latest versions for security and performance

## 1.0.0 (2025-03-04)

Initial release with core functionality:

- ✅ Add, get, find, and remove entries with dot notation
- ✅ Hierarchical data visualization with tree view
- ✅ Alias management for quick access to frequently used entries
- ✅ Configuration management
- ✅ Import/export capabilities
- ✅ Example data initialization
