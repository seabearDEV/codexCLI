package format

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var highlightStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("3")).Bold(true) // Yellow bold

// HighlightMatch highlights all case-insensitive occurrences of term in text.
func HighlightMatch(text, term string) string {
	if !colorsEnabled || term == "" {
		return text
	}
	lower := strings.ToLower(text)
	lowerTerm := strings.ToLower(term)

	var sb strings.Builder
	pos := 0
	for {
		idx := strings.Index(lower[pos:], lowerTerm)
		if idx < 0 {
			sb.WriteString(text[pos:])
			break
		}
		sb.WriteString(text[pos : pos+idx])
		sb.WriteString(highlightStyle.Render(text[pos+idx : pos+idx+len(term)]))
		pos += idx + len(term)
	}
	return sb.String()
}
