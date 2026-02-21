package fileutil

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const maxBackups = 10

// CreateAutoBackup creates a backup of entries.json, aliases.json, and
// confirm.json. Returns the backup directory path or empty string on failure.
func CreateAutoBackup(label string) string {
	dataDir := GetDataDirectory()
	backupDir := filepath.Join(dataDir, ".backups")

	if err := os.MkdirAll(backupDir, 0700); err != nil {
		return ""
	}

	// Timestamp format matches TypeScript: ISO without colons or fractional seconds
	ts := time.Now().UTC().Format("2006-01-02T15-04-05")
	backupSubDir := filepath.Join(backupDir, label+"-"+ts)
	if err := os.Mkdir(backupSubDir, 0700); err != nil {
		return ""
	}

	filesToBackup := []string{"entries.json", "aliases.json", "confirm.json"}
	backedUp := 0

	for _, file := range filesToBackup {
		src := filepath.Join(dataDir, file)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		data, err := os.ReadFile(src)
		if err != nil {
			continue
		}
		dest := filepath.Join(backupSubDir, file)
		if err := os.WriteFile(dest, data, 0600); err != nil {
			continue
		}
		backedUp++
	}

	if backedUp == 0 {
		_ = os.Remove(backupSubDir)
		return ""
	}

	// Rotate: keep only the 10 most recent backups
	rotateBackups(backupDir)

	return backupSubDir
}

func rotateBackups(backupDir string) {
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		return
	}

	var dirs []string
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, e.Name())
		}
	}
	sort.Strings(dirs)

	if len(dirs) > maxBackups {
		toRemove := dirs[:len(dirs)-maxBackups]
		for _, old := range toRemove {
			_ = os.RemoveAll(filepath.Join(backupDir, old))
		}
	}
}

// SaveJSONSorted writes JSON data to a file with file locking and sorted keys.
// The content string should already be sorted and formatted.
func SaveJSONSorted(filePath, content string) error {
	return WithFileLock(filePath, func() error {
		return AtomicWriteFile(filePath, content)
	})
}

// SortedJSONKeys returns the keys of a map sorted by locale-aware comparison.
func SortedJSONKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		return strings.Compare(keys[i], keys[j]) < 0
	})
	return keys
}
