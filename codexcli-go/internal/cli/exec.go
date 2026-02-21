package cli

import (
	"os/exec"
	"strings"
)

// execLookPath wraps exec.LookPath.
func execLookPath(name string) (string, error) {
	return exec.LookPath(name)
}

// execPipe runs a command with stdin piped from the given string.
func execPipe(name string, args []string, stdin string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdin = strings.NewReader(stdin)
	return cmd.Run()
}
