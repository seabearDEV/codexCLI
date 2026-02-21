package cli

import (
	"encoding/json"
	"os"
	"strings"

	"github.com/seabearDEV/codexcli-go/internal/fileutil"
)

// ConfirmMap is the type stored in confirm.json.
type ConfirmMap = map[string]bool

func loadConfirm() ConfirmMap {
	data, err := os.ReadFile(fileutil.GetConfirmFilePath())
	if err != nil {
		return make(ConfirmMap)
	}
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" {
		return make(ConfirmMap)
	}
	var result ConfirmMap
	if err := json.Unmarshal([]byte(trimmed), &result); err != nil {
		return make(ConfirmMap)
	}
	return result
}

func saveConfirm(m ConfirmMap) error {
	fileutil.EnsureDataDirectoryExists()
	content, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return fileutil.AtomicWriteFile(fileutil.GetConfirmFilePath(), string(content))
}

func setConfirm(key string) {
	m := loadConfirm()
	m[key] = true
	_ = saveConfirm(m)
}

func removeConfirm(key string) {
	m := loadConfirm()
	delete(m, key)
	_ = saveConfirm(m)
}

func removeConfirmForKey(key string) {
	m := loadConfirm()
	prefix := key + "."
	changed := false
	for k := range m {
		if k == key || strings.HasPrefix(k, prefix) {
			delete(m, k)
			changed = true
		}
	}
	if changed {
		_ = saveConfirm(m)
	}
}

func hasConfirm(key string) bool {
	m := loadConfirm()
	return m[key]
}
