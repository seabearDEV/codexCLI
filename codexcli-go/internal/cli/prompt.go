package cli

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"golang.org/x/term"
)

// isTTY returns true if stdin is a terminal.
func isTTY() bool {
	return term.IsTerminal(int(os.Stdin.Fd()))
}

// askConfirmation prompts the user with a [y/N] question. Returns true only
// if the user enters "y" or "Y".
func askConfirmation(prompt string) bool {
	fmt.Print(prompt)
	reader := bufio.NewReader(os.Stdin)
	line, _ := reader.ReadString('\n')
	answer := strings.TrimSpace(strings.ToLower(line))
	return answer == "y"
}

// askPassword reads a password from the terminal with input masking.
func askPassword(prompt string) (string, error) {
	fmt.Print(prompt)
	password, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println() // newline after masked input
	if err != nil {
		return "", err
	}
	return string(password), nil
}

// readStdin reads all of stdin and trims trailing whitespace.
func readStdin() (string, error) {
	var sb strings.Builder
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		if sb.Len() > 0 {
			sb.WriteByte('\n')
		}
		sb.WriteString(scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	return strings.TrimRight(sb.String(), " \t\n\r"), nil
}
