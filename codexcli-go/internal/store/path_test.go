package store

import (
	"reflect"
	"testing"
)

func TestGetNestedValue(t *testing.T) {
	data := CodexData{
		"server": map[string]any{
			"ip": "192.168.1.100",
			"production": map[string]any{
				"host": "prod.example.com",
			},
		},
		"simple": "value",
	}

	tests := []struct {
		name   string
		path   string
		want   any
		wantOk bool
	}{
		{"empty path", "", nil, false},
		{"top-level string", "simple", "value", true},
		{"nested string", "server.ip", "192.168.1.100", true},
		{"deep nested", "server.production.host", "prod.example.com", true},
		{"subtree", "server.production", map[string]any{"host": "prod.example.com"}, true},
		{"missing key", "nonexistent", nil, false},
		{"missing nested", "server.missing", nil, false},
		{"path through string", "simple.child", nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := GetNestedValue(data, tt.path)
			if ok != tt.wantOk {
				t.Errorf("GetNestedValue() ok = %v, want %v", ok, tt.wantOk)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("GetNestedValue() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSetNestedValue(t *testing.T) {
	tests := []struct {
		name  string
		path  string
		value string
		want  CodexData
	}{
		{
			"simple key",
			"key",
			"value",
			CodexData{"key": "value"},
		},
		{
			"nested key creates intermediate",
			"server.ip",
			"192.168.1.100",
			CodexData{"server": map[string]any{"ip": "192.168.1.100"}},
		},
		{
			"deep nested",
			"a.b.c",
			"deep",
			CodexData{"a": map[string]any{"b": map[string]any{"c": "deep"}}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			obj := make(CodexData)
			SetNestedValue(obj, tt.path, tt.value)
			if !reflect.DeepEqual(obj, tt.want) {
				t.Errorf("SetNestedValue() = %v, want %v", obj, tt.want)
			}
		})
	}
}

func TestSetNestedValueOverwritesString(t *testing.T) {
	obj := CodexData{"server": "old-string"}
	SetNestedValue(obj, "server.ip", "192.168.1.100")

	expected := CodexData{"server": map[string]any{"ip": "192.168.1.100"}}
	if !reflect.DeepEqual(obj, expected) {
		t.Errorf("SetNestedValue() overwrite = %v, want %v", obj, expected)
	}
}

func TestRemoveNestedValue(t *testing.T) {
	tests := []struct {
		name    string
		initial CodexData
		path    string
		want    CodexData
		changed bool
	}{
		{
			"remove top-level",
			CodexData{"key": "value", "other": "keep"},
			"key",
			CodexData{"other": "keep"},
			true,
		},
		{
			"remove nested cleans empty parents",
			CodexData{"server": map[string]any{"ip": "192.168.1.100"}},
			"server.ip",
			CodexData{},
			true,
		},
		{
			"remove nested keeps non-empty parent",
			CodexData{"server": map[string]any{"ip": "192.168.1.100", "name": "prod"}},
			"server.ip",
			CodexData{"server": map[string]any{"name": "prod"}},
			true,
		},
		{
			"remove non-existent returns false",
			CodexData{"key": "value"},
			"missing",
			CodexData{"key": "value"},
			false,
		},
		{
			"remove non-existent nested",
			CodexData{"server": map[string]any{"ip": "192.168.1.100"}},
			"server.missing",
			CodexData{"server": map[string]any{"ip": "192.168.1.100"}},
			false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			changed := RemoveNestedValue(tt.initial, tt.path)
			if changed != tt.changed {
				t.Errorf("RemoveNestedValue() changed = %v, want %v", changed, tt.changed)
			}
			if !reflect.DeepEqual(tt.initial, tt.want) {
				t.Errorf("RemoveNestedValue() result = %v, want %v", tt.initial, tt.want)
			}
		})
	}
}

func TestFlattenObject(t *testing.T) {
	obj := map[string]any{
		"server": map[string]any{
			"ip": "192.168.1.100",
			"production": map[string]any{
				"host": "prod.example.com",
			},
		},
		"simple": "value",
	}

	result := FlattenObject(obj, "")

	expected := map[string]string{
		"server.ip":              "192.168.1.100",
		"server.production.host": "prod.example.com",
		"simple":                 "value",
	}

	if !reflect.DeepEqual(result, expected) {
		t.Errorf("FlattenObject() = %v, want %v", result, expected)
	}
}
