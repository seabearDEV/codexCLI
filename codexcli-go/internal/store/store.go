package store

import (
	"encoding/json"
	"os"
	"sort"
	"strings"
	"sync"

	"github.com/seabearDEV/codexcli-go/internal/fileutil"
)

// Store manages the entries.json data with mtime-based caching.
type Store struct {
	mu         sync.Mutex
	cache      CodexData
	cacheMtime int64 // UnixNano for precision
}

// NewStore creates a new Store instance.
func NewStore() *Store {
	return &Store{}
}

// defaultStore is the package-level store instance.
var defaultStore = NewStore()

// ClearCache invalidates the mtime cache.
func (s *Store) ClearCache() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache = nil
	s.cacheMtime = 0
}

// Load reads entries.json with mtime caching.
func (s *Store) Load() CodexData {
	s.mu.Lock()
	defer s.mu.Unlock()

	filePath := fileutil.GetEntriesFilePath()

	// Fast path: check if file mtime matches cache
	if s.cache != nil && s.cacheMtime != 0 {
		info, err := os.Stat(filePath)
		if err != nil {
			s.cache = nil
			s.cacheMtime = 0
		} else if info.ModTime().UnixNano() == s.cacheMtime {
			return deepCopy(s.cache)
		}
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return make(CodexData)
	}

	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" {
		return make(CodexData)
	}

	var result CodexData
	if err := json.Unmarshal([]byte(trimmed), &result); err != nil {
		return make(CodexData)
	}

	info, err := os.Stat(filePath)
	if err == nil {
		s.cache = deepCopy(result)
		s.cacheMtime = info.ModTime().UnixNano()
	}

	return result
}

// Save writes entries.json with sorted keys and updates the cache.
func (s *Store) Save(data CodexData) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	fileutil.EnsureDataDirectoryExists()
	filePath := fileutil.GetEntriesFilePath()

	sorted := sortMapKeys(data)
	content, err := json.MarshalIndent(sorted, "", "  ")
	if err != nil {
		return err
	}

	if err := fileutil.SaveJSONSorted(filePath, string(content)); err != nil {
		return err
	}

	// Update cache with new mtime
	info, err := os.Stat(filePath)
	if err == nil {
		s.cache = deepCopy(data)
		s.cacheMtime = info.ModTime().UnixNano()
	}

	return nil
}

// GetValue retrieves a value by dot-notation key.
func (s *Store) GetValue(key string) (CodexValue, bool) {
	data := s.Load()
	return GetNestedValue(data, key)
}

// SetValue sets a value at the given dot-notation key.
func (s *Store) SetValue(key, value string) error {
	data := s.Load()
	SetNestedValue(data, key, value)
	return s.Save(data)
}

// RemoveValue removes a value at the given dot-notation key.
func (s *Store) RemoveValue(key string) (bool, error) {
	data := s.Load()
	changed := RemoveNestedValue(data, key)
	if !changed {
		return false, nil
	}
	return true, s.Save(data)
}

// GetEntriesFlat returns all entries as a flat dot-notation map.
func (s *Store) GetEntriesFlat() map[string]string {
	data := s.Load()
	return FlattenObject(data, "")
}

// --- Package-level convenience functions ---

func LoadData() CodexData           { return defaultStore.Load() }
func SaveData(d CodexData) error    { return defaultStore.Save(d) }
func ClearDataCache()               { defaultStore.ClearCache() }
func GetValue(key string) (CodexValue, bool) { return defaultStore.GetValue(key) }
func SetValue(key, value string) error       { return defaultStore.SetValue(key, value) }
func RemoveValue(key string) (bool, error)   { return defaultStore.RemoveValue(key) }
func GetEntriesFlat() map[string]string      { return defaultStore.GetEntriesFlat() }

// --- Helpers ---

// deepCopy creates a deep copy of a CodexData map.
func deepCopy(src CodexData) CodexData {
	if src == nil {
		return nil
	}
	dst := make(CodexData, len(src))
	for k, v := range src {
		switch val := v.(type) {
		case map[string]any:
			dst[k] = deepCopy(val)
		default:
			dst[k] = val
		}
	}
	return dst
}

// sortMapKeys returns an ordered map (for JSON serialization with sorted keys).
func sortMapKeys(m map[string]any) map[string]any {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	result := make(map[string]any, len(m))
	for _, k := range keys {
		v := m[k]
		if sub, ok := v.(map[string]any); ok {
			result[k] = sortMapKeys(sub)
		} else {
			result[k] = v
		}
	}
	return result
}
