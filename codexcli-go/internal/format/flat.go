package format

import (
	"fmt"
	"sort"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	keyStyle       = lipgloss.NewStyle().Foreground(lipgloss.Color("6"))  // Cyan
	valueStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("7"))  // White
	aliasStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("4"))  // Blue
	encryptedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))  // Yellow
	confirmStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))  // Red
	successStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))  // Green
	errorStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))  // Red
	warningStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))  // Yellow
	grayStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))  // Gray
)

// colorsEnabled controls whether output is colorized.
var colorsEnabled = true

// SetColorsEnabled enables or disables color output.
func SetColorsEnabled(enabled bool) {
	colorsEnabled = enabled
}

func styled(s lipgloss.Style, text string) string {
	if !colorsEnabled {
		return text
	}
	return s.Render(text)
}

// FormatEntries formats entries as colorized key: value lines.
// keyToAlias maps entry keys to their alias names (optional).
// confirmKeys maps entry keys that require confirmation (optional).
func FormatEntries(entries map[string]string, keyToAlias map[string]string, confirmKeys map[string]bool) string {
	if len(entries) == 0 {
		return ""
	}

	keys := make([]string, 0, len(entries))
	for k := range entries {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var sb strings.Builder
	for _, k := range keys {
		v := entries[k]

		line := styled(keyStyle, k) + ": "

		if isEncrypted(v) {
			line += styled(encryptedStyle, "[encrypted]")
		} else {
			line += styled(valueStyle, v)
		}

		if alias, ok := keyToAlias[k]; ok {
			line += " " + styled(aliasStyle, "("+alias+")")
		}
		if confirmKeys[k] {
			line += " " + styled(confirmStyle, "[confirm]")
		}

		sb.WriteString(line + "\n")
	}
	return sb.String()
}

// FormatAliases formats the alias map as colorized lines.
func FormatAliases(aliases map[string]string) string {
	if len(aliases) == 0 {
		return ""
	}

	keys := make([]string, 0, len(aliases))
	for k := range aliases {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var sb strings.Builder
	for _, k := range keys {
		sb.WriteString(styled(aliasStyle, k) + ": " + styled(valueStyle, aliases[k]) + "\n")
	}
	return sb.String()
}

// Success formats a success message with a green checkmark prefix.
func Success(msg string) string {
	return styled(successStyle, "✓ ") + msg
}

// Error formats an error message with a red X prefix.
func Error(msg string) string {
	return styled(errorStyle, "✗ ") + msg
}

// Warning formats a warning message with a yellow warning prefix.
func Warning(msg string) string {
	return styled(warningStyle, "⚠ ") + msg
}

// Gray returns gray-styled text.
func Gray(text string) string {
	return styled(grayStyle, text)
}

// RunCommand formats a command for display ($ prefix).
func RunCommand(cmd string) string {
	return styled(grayStyle, "$ ") + styled(valueStyle, cmd)
}

func isEncrypted(value string) bool {
	return strings.HasPrefix(value, "encrypted::v1:")
}

// FormatSingleEntry formats a single key-value pair.
func FormatSingleEntry(key, value string, aliasName string, hasConfirm bool) string {
	line := styled(keyStyle, key) + ": "

	if isEncrypted(value) {
		line += styled(encryptedStyle, "[encrypted]")
	} else {
		line += styled(valueStyle, value)
	}

	if aliasName != "" {
		line += " " + styled(aliasStyle, "("+aliasName+")")
	}
	if hasConfirm {
		line += " " + styled(confirmStyle, "[confirm]")
	}

	return line
}

// NoEntriesMessage returns the "no entries" help message.
func NoEntriesMessage(binName string) string {
	return fmt.Sprintf("No entries found. Add one with \"%s set <key> <value>\"", binName)
}
