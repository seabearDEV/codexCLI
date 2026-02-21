package format

import "encoding/json"

// ToJSON formats a value as pretty-printed JSON.
func ToJSON(v any) string {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(b)
}
