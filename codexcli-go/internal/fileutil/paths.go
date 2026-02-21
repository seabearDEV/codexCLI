package fileutil

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	dataDirOnce sync.Once
	dataDirPath string
)

// getBinaryName returns the base name of the running binary without extension.
func getBinaryName() string {
	name := filepath.Base(os.Args[0])
	return strings.TrimSuffix(name, filepath.Ext(name))
}

// isDev returns true if the binary is running in development mode.
func isDev() bool {
	if os.Getenv("NODE_ENV") == "development" {
		return true
	}
	return getBinaryName() == "cclid"
}

// GetDataDirectory returns the data directory path using the same priority as
// the TypeScript version:
//  1. $CODEX_DATA_DIR (if set)
//  2. Dev mode (binary named "cclid"): <executable-dir>/../../data/
//  3. Production: ~/.codexcli/
func GetDataDirectory() string {
	dataDirOnce.Do(func() {
		if env := os.Getenv("CODEX_DATA_DIR"); env != "" {
			dataDirPath = env
			return
		}
		if isDev() {
			exe, err := os.Executable()
			if err == nil {
				dataDirPath = filepath.Join(filepath.Dir(exe), "..", "..", "data")
				return
			}
		}
		home, err := os.UserHomeDir()
		if err != nil {
			home = "."
		}
		dataDirPath = filepath.Join(home, ".codexcli")
	})
	return dataDirPath
}

// ResetDataDirectory resets the cached data directory (for testing).
func ResetDataDirectory() {
	dataDirOnce = sync.Once{}
	dataDirPath = ""
}

// EnsureDataDirectoryExists creates the data directory if it doesn't exist.
func EnsureDataDirectoryExists() string {
	dir := GetDataDirectory()
	_ = os.MkdirAll(dir, 0700)
	return dir
}

// GetEntriesFilePath returns the path to entries.json, auto-migrating from
// data.json if needed.
func GetEntriesFilePath() string {
	dir := GetDataDirectory()
	newPath := filepath.Join(dir, "entries.json")
	oldPath := filepath.Join(dir, "data.json")

	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		if _, err := os.Stat(oldPath); err == nil {
			_ = os.Rename(oldPath, newPath)
		}
	}
	return newPath
}

// GetAliasFilePath returns the path to aliases.json.
func GetAliasFilePath() string {
	return filepath.Join(GetDataDirectory(), "aliases.json")
}

// GetConfigFilePath returns the path to config.json.
func GetConfigFilePath() string {
	return filepath.Join(GetDataDirectory(), "config.json")
}

// GetConfirmFilePath returns the path to confirm.json.
func GetConfirmFilePath() string {
	return filepath.Join(GetDataDirectory(), "confirm.json")
}
