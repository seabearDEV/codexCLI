package store

import (
	"strings"
	"testing"
)

func TestInterpolate(t *testing.T) {
	data := map[string]string{
		"server.ip":   "192.168.1.100",
		"server.host": "host-${server.ip}",
		"greeting":    "hello",
	}
	aliases := map[string]string{
		"ip": "server.ip",
	}

	resolve := func(key string) string {
		if target, ok := aliases[key]; ok {
			return target
		}
		return key
	}
	lookup := func(key string) (CodexValue, bool) {
		v, ok := data[key]
		return v, ok
	}
	isEnc := func(v string) bool {
		return strings.HasPrefix(v, "encrypted::v1:")
	}

	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"no interpolation", "hello", "hello", false},
		{"simple ref", "IP: ${server.ip}", "IP: 192.168.1.100", false},
		{"alias ref", "IP: ${ip}", "IP: 192.168.1.100", false},
		{"recursive", "${server.host}", "host-192.168.1.100", false},
		{"missing ref unchanged", "val: ${missing}", "val: ${missing}", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Interpolate(tt.input, resolve, lookup, isEnc)
			if (err != nil) != tt.wantErr {
				t.Errorf("Interpolate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("Interpolate() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestInterpolateCircular(t *testing.T) {
	data := map[string]string{
		"a": "${b}",
		"b": "${a}",
	}

	resolve := func(key string) string { return key }
	lookup := func(key string) (CodexValue, bool) {
		v, ok := data[key]
		return v, ok
	}
	isEnc := func(v string) bool { return false }

	_, err := Interpolate("${a}", resolve, lookup, isEnc)
	if err == nil {
		t.Error("expected circular interpolation error")
	}
	if !strings.Contains(err.Error(), "ircular") {
		t.Errorf("expected circular error, got: %v", err)
	}
}

func TestInterpolateEncryptedRef(t *testing.T) {
	data := map[string]string{
		"secret": "encrypted::v1:abc123",
	}

	resolve := func(key string) string { return key }
	lookup := func(key string) (CodexValue, bool) {
		v, ok := data[key]
		return v, ok
	}
	isEnc := func(v string) bool {
		return strings.HasPrefix(v, "encrypted::v1:")
	}

	_, err := Interpolate("${secret}", resolve, lookup, isEnc)
	if err == nil {
		t.Error("expected encrypted interpolation error")
	}
	if !strings.Contains(err.Error(), "encrypted") {
		t.Errorf("expected encrypted error, got: %v", err)
	}
}
