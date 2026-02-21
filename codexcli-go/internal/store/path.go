package store

import (
	"fmt"
	"strings"
)

// CodexValue is either a string or a nested map.
type CodexValue = any

// CodexData is the top-level data map.
type CodexData = map[string]CodexValue

// GetNestedValue retrieves a value from a nested map using dot-notation path.
func GetNestedValue(obj CodexData, path string) (CodexValue, bool) {
	if path == "" {
		return nil, false
	}
	keys := strings.Split(path, ".")
	var current CodexValue = obj[keys[0]]
	if current == nil {
		return nil, false
	}

	for i := 1; i < len(keys); i++ {
		m, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current = m[keys[i]]
		if current == nil {
			return nil, false
		}
	}
	return current, true
}

// SetNestedValue sets a value at the given dot-notation path, creating
// intermediate maps as needed. Overwrites non-map intermediates.
func SetNestedValue(obj CodexData, path string, value string) {
	keys := strings.Split(path, ".")
	current := obj

	for i := 0; i < len(keys)-1; i++ {
		k := keys[i]
		next, ok := current[k]
		if !ok {
			m := make(map[string]any)
			current[k] = m
			current = m
			continue
		}
		m, ok := next.(map[string]any)
		if !ok {
			m = make(map[string]any)
			current[k] = m
		}
		current = m
	}
	current[keys[len(keys)-1]] = value
}

// RemoveNestedValue removes the value at the given dot-notation path.
// It cleans up empty parent maps. Returns true if something was removed.
func RemoveNestedValue(obj CodexData, path string) bool {
	keys := strings.Split(path, ".")

	if len(keys) == 1 {
		if _, ok := obj[keys[0]]; !ok {
			return false
		}
		delete(obj, keys[0])
		return true
	}

	type frame struct {
		obj map[string]any
		key string
	}
	var stack []frame
	current := obj

	for i := 0; i < len(keys)-1; i++ {
		k := keys[i]
		next, ok := current[k]
		if !ok {
			return false
		}
		m, ok := next.(map[string]any)
		if !ok {
			return false
		}
		stack = append(stack, frame{obj: current, key: k})
		current = m
	}

	lastKey := keys[len(keys)-1]
	if _, ok := current[lastKey]; !ok {
		return false
	}
	delete(current, lastKey)

	// Clean up empty parents bottom-up
	for i := len(stack) - 1; i >= 0; i-- {
		f := stack[i]
		child, _ := f.obj[f.key].(map[string]any)
		if len(child) == 0 {
			delete(f.obj, f.key)
		} else {
			break
		}
	}
	return true
}

// FlattenObject flattens a nested map into a flat dot-notation map.
func FlattenObject(obj map[string]any, parentKey string) map[string]string {
	result := make(map[string]string)
	for k, v := range obj {
		newKey := k
		if parentKey != "" {
			newKey = parentKey + "." + k
		}
		switch val := v.(type) {
		case map[string]any:
			for fk, fv := range FlattenObject(val, newKey) {
				result[fk] = fv
			}
		default:
			result[newKey] = fmt.Sprintf("%v", val)
		}
	}
	return result
}
