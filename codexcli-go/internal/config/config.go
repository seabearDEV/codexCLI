package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/seabearDEV/codexcli-go/internal/fileutil"
)

// Config represents the application configuration.
type Config struct {
	Colors bool   `json:"colors"`
	Theme  string `json:"theme"`
}

var (
	ValidThemes     = []string{"default", "dark", "light"}
	ValidConfigKeys = []string{"colors", "theme"}

	mu         sync.Mutex
	cache      *Config
	cacheMtime int64
)

func defaultConfig() Config {
	return Config{
		Colors: true,
		Theme:  "default",
	}
}

// ClearCache invalidates the config cache.
func ClearCache() {
	mu.Lock()
	defer mu.Unlock()
	cache = nil
	cacheMtime = 0
}

// Load reads config.json with mtime caching. Returns defaults if file is
// missing or invalid.
func Load() Config {
	mu.Lock()
	defer mu.Unlock()
	return loadLocked()
}

func loadLocked() Config {
	filePath := fileutil.GetConfigFilePath()

	if cache != nil && cacheMtime != 0 {
		info, err := os.Stat(filePath)
		if err != nil {
			cache = nil
			cacheMtime = 0
		} else if info.ModTime().UnixNano() == cacheMtime {
			return *cache
		}
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		// File doesn't exist — create with defaults
		def := defaultConfig()
		_ = saveLocked(def)
		return def
	}

	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" {
		def := defaultConfig()
		return def
	}

	var cfg Config
	if err := json.Unmarshal([]byte(trimmed), &cfg); err != nil {
		return defaultConfig()
	}

	// Fill missing fields with defaults (migration safety)
	def := defaultConfig()
	if cfg.Theme == "" {
		cfg.Theme = def.Theme
	}

	info, err := os.Stat(filePath)
	if err == nil {
		c := cfg
		cache = &c
		cacheMtime = info.ModTime().UnixNano()
	}

	return cfg
}

// Save writes config.json.
func Save(cfg Config) error {
	mu.Lock()
	defer mu.Unlock()
	return saveLocked(cfg)
}

func saveLocked(cfg Config) error {
	fileutil.EnsureDataDirectoryExists()
	filePath := fileutil.GetConfigFilePath()

	content, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	if err := fileutil.AtomicWriteFile(filePath, string(content)); err != nil {
		return err
	}

	info, err := os.Stat(filePath)
	if err == nil {
		c := cfg
		cache = &c
		cacheMtime = info.ModTime().UnixNano()
	}
	return nil
}

// GetSetting returns a config value by key name, or nil for unknown keys.
func GetSetting(key string) any {
	cfg := Load()
	switch key {
	case "colors":
		return cfg.Colors
	case "theme":
		return cfg.Theme
	default:
		return nil
	}
}

// SetSetting validates and sets a config value.
func SetSetting(key string, value string) error {
	mu.Lock()
	defer mu.Unlock()

	cfg := loadLocked()

	switch key {
	case "colors":
		v := strings.ToLower(value)
		cfg.Colors = v == "true" || v == "1"
		return saveLocked(cfg)

	case "theme":
		valid := false
		for _, t := range ValidThemes {
			if value == t {
				valid = true
				break
			}
		}
		if !valid {
			return fmt.Errorf("invalid theme: '%s'. Must be one of: %s", value, strings.Join(ValidThemes, ", "))
		}
		cfg.Theme = value
		return saveLocked(cfg)

	default:
		return fmt.Errorf("unknown configuration key: %s", key)
	}
}
