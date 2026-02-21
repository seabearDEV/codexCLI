package store

import (
	"fmt"
	"regexp"
	"strings"
)

var interpolateRe = regexp.MustCompile(`\$\{([^}]+)\}`)

const maxInterpolationDepth = 10

// Interpolate resolves ${key_or_alias} patterns in a value string.
// It uses aliasResolver to map alias names to entry keys, and valueLookup
// to fetch string values. Encrypted and non-string values cannot be interpolated.
func Interpolate(value string, aliasResolver func(string) string, valueLookup func(string) (CodexValue, bool), isEncrypted func(string) bool) (string, error) {
	visited := make(map[string]bool)
	return interpolateRecursive(value, aliasResolver, valueLookup, isEncrypted, visited, 0)
}

func interpolateRecursive(value string, aliasResolver func(string) string, valueLookup func(string) (CodexValue, bool), isEncrypted func(string) bool, visited map[string]bool, depth int) (string, error) {
	if depth >= maxInterpolationDepth {
		return value, fmt.Errorf("maximum interpolation depth (%d) exceeded", maxInterpolationDepth)
	}

	if !strings.Contains(value, "${") {
		return value, nil
	}

	var lastErr error
	result := interpolateRe.ReplaceAllStringFunc(value, func(match string) string {
		ref := interpolateRe.FindStringSubmatch(match)[1]

		// Resolve alias first
		resolvedKey := aliasResolver(ref)

		// Check for circular reference
		if visited[resolvedKey] {
			lastErr = fmt.Errorf("circular interpolation detected: %s", buildChain(visited, resolvedKey))
			return match
		}

		// Look up value
		val, ok := valueLookup(resolvedKey)
		if !ok {
			return match // Leave unresolved
		}

		str, ok := val.(string)
		if !ok {
			lastErr = fmt.Errorf("cannot interpolate non-string value at key '%s'", resolvedKey)
			return match
		}

		if isEncrypted(str) {
			lastErr = fmt.Errorf("cannot interpolate encrypted value at key '%s'", resolvedKey)
			return match
		}

		// Mark as visited and recurse
		visited[resolvedKey] = true
		resolved, err := interpolateRecursive(str, aliasResolver, valueLookup, isEncrypted, visited, depth+1)
		delete(visited, resolvedKey)

		if err != nil {
			lastErr = err
			return match
		}
		return resolved
	})

	return result, lastErr
}

func buildChain(visited map[string]bool, current string) string {
	keys := make([]string, 0, len(visited)+1)
	for k := range visited {
		keys = append(keys, k)
	}
	keys = append(keys, current)
	return strings.Join(keys, " → ")
}
