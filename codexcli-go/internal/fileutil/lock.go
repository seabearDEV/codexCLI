package fileutil

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

const lockStaleMs = 10_000 // 10 seconds

// AcquireLock acquires a file-based lock using O_CREATE|O_EXCL for atomicity.
// It retries up to maxRetries times with exponential backoff and breaks stale
// locks older than 10 seconds.
func AcquireLock(filePath string, maxRetries int) error {
	lockPath := filePath + ".lock"

	for attempt := 0; attempt <= maxRetries; attempt++ {
		f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err == nil {
			_, _ = f.WriteString(strconv.Itoa(os.Getpid()))
			f.Close()
			return nil
		}

		if !os.IsExist(err) {
			return err
		}

		// Lock file exists — check if stale
		info, statErr := os.Stat(lockPath)
		if statErr != nil {
			// Lock file disappeared — retry
			continue
		}
		if time.Since(info.ModTime()).Milliseconds() > lockStaleMs {
			_ = os.Remove(lockPath)
			continue
		}

		if attempt < maxRetries {
			time.Sleep(time.Duration(1<<uint(attempt)) * time.Millisecond)
			continue
		}

		return fmt.Errorf("unable to acquire lock on %s after %d retries", filePath, maxRetries)
	}
	return nil
}

// ReleaseLock removes the lock file. Errors are silently ignored.
func ReleaseLock(filePath string) {
	_ = os.Remove(filePath + ".lock")
}

// WithFileLock acquires a lock, runs fn, and releases the lock.
// If lock acquisition fails, fn is still executed (graceful degradation).
func WithFileLock(filePath string, fn func() error) error {
	locked := false
	if err := AcquireLock(filePath, 5); err == nil {
		locked = true
	}
	defer func() {
		if locked {
			ReleaseLock(filePath)
		}
	}()
	return fn()
}
