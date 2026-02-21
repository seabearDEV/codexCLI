package cli

import (
	"crypto/subtle"
	"fmt"
	"strings"

	"github.com/seabearDEV/codexcli-go/internal/alias"
	"github.com/seabearDEV/codexcli-go/internal/crypto"
	"github.com/seabearDEV/codexcli-go/internal/format"
	"github.com/seabearDEV/codexcli-go/internal/store"
	"github.com/spf13/cobra"
)

func newSetCmd() *cobra.Command {
	var (
		force     bool
		encrypt   bool
		aliasName string
		prompt    bool
		show      bool
		clear     bool
		confirm   bool
		noConfirm bool
	)

	cmd := &cobra.Command{
		Use:     "set <key> [value...]",
		Aliases: []string{"s"},
		Short:   "Store a key-value entry",
		Args:    cobra.MinimumNArgs(1),
		ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
			if len(args) != 0 {
				return nil, cobra.ShellCompDirectiveNoFileComp
			}
			flat := store.GetEntriesFlat()
			keys := make([]string, 0, len(flat))
			for k := range flat {
				keys = append(keys, k)
			}
			aliases := alias.Load()
			for name, target := range aliases {
				keys = append(keys, name+"\t→ "+target)
			}
			return keys, cobra.ShellCompDirectiveNoFileComp
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			key := stripTrailingColon(args[0])
			key = alias.ResolveKey(key)
			valueArgs := args[1:]

			var value string
			hasValue := false

			// Determine value
			if prompt {
				if !isTTY() {
					return fmt.Errorf("--prompt requires a terminal (TTY)")
				}
				if show {
					fmt.Print("Value: ")
					var input string
					fmt.Scanln(&input)
					value = input
				} else {
					p1, err := askPassword("Value: ")
					if err != nil {
						return err
					}
					p2, err := askPassword("Confirm value: ")
					if err != nil {
						return err
					}
					if subtle.ConstantTimeCompare([]byte(p1), []byte(p2)) != 1 {
						return fmt.Errorf("values do not match")
					}
					value = p1
				}
				hasValue = true
			} else if len(valueArgs) > 0 {
				value = strings.Join(valueArgs, " ")
				hasValue = true
			} else if !isTTY() {
				// Read from stdin
				stdinVal, err := readStdin()
				if err != nil {
					return err
				}
				if stdinVal != "" {
					value = stdinVal
					hasValue = true
				}
			}

			// Metadata-only check
			confirmFlagSet := cmd.Flags().Changed("confirm") || cmd.Flags().Changed("no-confirm")
			if !hasValue && aliasName == "" && !confirmFlagSet {
				return fmt.Errorf("no value provided. Use: ccli set <key> <value>")
			}

			// Check existing value and prompt for overwrite
			if hasValue {
				if existing, ok := store.GetValue(key); ok && !force && isTTY() {
					displayVal := "[encrypted]"
					if s, ok := existing.(string); ok && !crypto.IsEncrypted(s) {
						displayVal = s
					}
					fmt.Printf("Current value: %s\n", displayVal)
					if !askConfirmation("Overwrite? [y/N] ") {
						fmt.Println("Aborted.")
						return nil
					}
				}
			}

			// Encrypt if requested
			if encrypt && hasValue {
				encrypted, err := promptAndEncrypt(value)
				if err != nil {
					return err
				}
				value = encrypted
			}

			// Set the value
			if hasValue {
				if err := store.SetValue(key, value); err != nil {
					return err
				}
				fmt.Println(format.Success(fmt.Sprintf("Entry '%s' set successfully.", key)))
			}

			// Handle alias
			if aliasName != "" {
				alias.SetAlias(aliasName, key)
			}

			// Handle confirm flag
			if cmd.Flags().Changed("confirm") && confirm {
				setConfirm(key)
				fmt.Printf("Entry '%s' now requires confirmation to run.\n", key)
			} else if cmd.Flags().Changed("no-confirm") && noConfirm {
				removeConfirm(key)
				fmt.Printf("Entry '%s' no longer requires confirmation to run.\n", key)
			}

			// Clear screen if requested
			if clear {
				fmt.Print("\x1b[2J\x1b[3J\x1b[H")
			}

			return nil
		},
	}

	cmd.Flags().BoolVarP(&force, "force", "f", false, "Skip overwrite confirmation")
	cmd.Flags().BoolVarP(&encrypt, "encrypt", "e", false, "Encrypt the value")
	cmd.Flags().StringVarP(&aliasName, "alias", "a", "", "Create alias for this key")
	cmd.Flags().BoolVarP(&prompt, "prompt", "p", false, "Read value interactively")
	cmd.Flags().BoolVarP(&show, "show", "s", false, "Show input when using --prompt")
	cmd.Flags().BoolVarP(&clear, "clear", "c", false, "Clear terminal after setting")
	cmd.Flags().BoolVar(&confirm, "confirm", false, "Require confirmation to run")
	cmd.Flags().BoolVar(&noConfirm, "no-confirm", false, "Remove confirmation requirement")

	return cmd
}

// promptAndEncrypt prompts for a password and encrypts the value.
func promptAndEncrypt(value string) (string, error) {
	p1, err := askPassword("Password: ")
	if err != nil {
		return "", err
	}
	p2, err := askPassword("Confirm password: ")
	if err != nil {
		return "", err
	}
	if subtle.ConstantTimeCompare([]byte(p1), []byte(p2)) != 1 {
		return "", fmt.Errorf("passwords do not match")
	}
	return crypto.EncryptValue(value, p1)
}
