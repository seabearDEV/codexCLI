package alias

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"

	"github.com/seabearDEV/codexcli-go/internal/fileutil"
)

// AliasMap is a flat alias-name → target-path mapping.
type AliasMap = map[string]string

var (
	mu         sync.Mutex
	cache      AliasMap
	cacheMtime int64
)

// ClearCache invalidates the alias cache.
func ClearCache() {
	mu.Lock()
	defer mu.Unlock()
	cache = nil
	cacheMtime = 0
}

// Load reads aliases.json with mtime caching.
func Load() AliasMap {
	mu.Lock()
	defer mu.Unlock()
	return loadLocked()
}

func loadLocked() AliasMap {
	filePath := fileutil.GetAliasFilePath()

	if cache != nil && cacheMtime != 0 {
		info, err := os.Stat(filePath)
		if err != nil {
			cache = nil
			cacheMtime = 0
		} else if info.ModTime().UnixNano() == cacheMtime {
			return copyMap(cache)
		}
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return make(AliasMap)
	}

	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" {
		return make(AliasMap)
	}

	var result AliasMap
	if err := json.Unmarshal([]byte(trimmed), &result); err != nil {
		return make(AliasMap)
	}

	info, err := os.Stat(filePath)
	if err == nil {
		cache = copyMap(result)
		cacheMtime = info.ModTime().UnixNano()
	}

	return result
}

// Save writes aliases.json with sorted keys and updates the cache.
func Save(aliases AliasMap) error {
	mu.Lock()
	defer mu.Unlock()
	return saveLocked(aliases)
}

func saveLocked(aliases AliasMap) error {
	fileutil.EnsureDataDirectoryExists()
	filePath := fileutil.GetAliasFilePath()

	// Sort keys
	keys := make([]string, 0, len(aliases))
	for k := range aliases {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	sorted := make(map[string]string, len(aliases))
	for _, k := range keys {
		sorted[k] = aliases[k]
	}

	content, err := json.MarshalIndent(sorted, "", "  ")
	if err != nil {
		return err
	}

	if err := fileutil.SaveJSONSorted(filePath, string(content)); err != nil {
		return err
	}

	info, err := os.Stat(filePath)
	if err == nil {
		cache = copyMap(aliases)
		cacheMtime = info.ModTime().UnixNano()
	}
	return nil
}

// SetAlias creates or updates an alias. Enforces one alias per entry path.
func SetAlias(aliasName, path string) {
	mu.Lock()
	defer mu.Unlock()

	aliases := loadLocked()

	// Enforce one alias per entry: remove any existing alias pointing to this path
	keyToAlias := buildKeyToAliasMap(aliases)
	if existing, ok := keyToAlias[path]; ok && existing != aliasName {
		delete(aliases, existing)
	}

	aliases[aliasName] = path
	_ = saveLocked(aliases)
	fmt.Printf("Alias '%s' added successfully.\n", aliasName)
}

// RemoveAlias removes an alias. Returns true if it existed.
func RemoveAlias(aliasName string) bool {
	mu.Lock()
	defer mu.Unlock()

	aliases := loadLocked()
	if _, ok := aliases[aliasName]; !ok {
		return false
	}
	delete(aliases, aliasName)
	_ = saveLocked(aliases)
	return true
}

// RenameAlias renames an alias. Returns false if old doesn't exist or new already exists.
func RenameAlias(oldName, newName string) bool {
	mu.Lock()
	defer mu.Unlock()

	aliases := loadLocked()
	target, ok := aliases[oldName]
	if !ok {
		return false
	}
	if _, exists := aliases[newName]; exists {
		return false
	}
	delete(aliases, oldName)
	aliases[newName] = target
	_ = saveLocked(aliases)
	return true
}

// ResolveKey returns the alias target if the key is an alias, otherwise
// returns the key unchanged.
func ResolveKey(key string) string {
	aliases := Load()
	if target, ok := aliases[key]; ok {
		return target
	}
	return key
}

// RemoveAliasesForKey removes all aliases whose target matches the key
// or starts with key + "." (cascade delete for subtrees).
func RemoveAliasesForKey(key string) {
	mu.Lock()
	defer mu.Unlock()

	aliases := loadLocked()
	prefix := key + "."
	changed := false

	for name, target := range aliases {
		if target == key || strings.HasPrefix(target, prefix) {
			delete(aliases, name)
			changed = true
		}
	}

	if changed {
		_ = saveLocked(aliases)
	}
}

// BuildKeyToAliasMap inverts the alias map: target-path → alias-name.
func BuildKeyToAliasMap(aliases AliasMap) map[string]string {
	return buildKeyToAliasMap(aliases)
}

func buildKeyToAliasMap(aliases AliasMap) map[string]string {
	result := make(map[string]string, len(aliases))
	for name, target := range aliases {
		result[target] = name
	}
	return result
}

func copyMap(src AliasMap) AliasMap {
	if src == nil {
		return nil
	}
	dst := make(AliasMap, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}
