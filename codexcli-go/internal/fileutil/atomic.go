package fileutil

import "os"

// AtomicWriteFile writes content to a temporary file and atomically renames it
// to the target path. The file is created with mode 0600.
func AtomicWriteFile(filePath, content string) error {
	tmpPath := filePath + ".tmp"
	if err := os.WriteFile(tmpPath, []byte(content), 0600); err != nil {
		return err
	}
	return os.Rename(tmpPath, filePath)
}
