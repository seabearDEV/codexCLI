package cli

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/seabearDEV/codexcli-go/internal/alias"
	"github.com/seabearDEV/codexcli-go/internal/crypto"
	"github.com/seabearDEV/codexcli-go/internal/format"
	"github.com/seabearDEV/codexcli-go/internal/store"
	"github.com/spf13/cobra"
)

func newGetCmd() *cobra.Command {
	var (
		tree      bool
		raw       bool
		source    bool
		decrypt   bool
		copy      bool
		showAlias bool
		jsonOut   bool
	)

	cmd := &cobra.Command{
		Use:     "get [key]",
		Aliases: []string{"g"},
		Short:   "Retrieve a stored entry",
		Args:    cobra.MaximumNArgs(1),
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
			aliases := alias.Load()
			keyToAlias := alias.BuildKeyToAliasMap(aliases)
			confirmMap := loadConfirm()

			// No key: show all
			if len(args) == 0 {
				return getAllEntries(showAlias, tree, jsonOut, raw, aliases, keyToAlias, confirmMap)
			}

			key := stripTrailingColon(args[0])
			key = alias.ResolveKey(key)

			return getSpecificKey(key, tree, raw, source, decrypt, copy, jsonOut, aliases, keyToAlias, confirmMap)
		},
	}

	cmd.Flags().BoolVarP(&tree, "tree", "t", false, "Display as tree")
	cmd.Flags().BoolVarP(&raw, "raw", "r", false, "Plain text output")
	cmd.Flags().BoolVarP(&source, "source", "s", false, "Show stored value before interpolation")
	cmd.Flags().BoolVarP(&decrypt, "decrypt", "d", false, "Decrypt encrypted value")
	cmd.Flags().BoolVarP(&copy, "copy", "c", false, "Copy value to clipboard")
	cmd.Flags().BoolVarP(&showAlias, "aliases", "a", false, "Show aliases only")
	cmd.Flags().BoolVarP(&jsonOut, "json", "j", false, "Output as JSON")

	return cmd
}

func getAllEntries(showAliasOnly, tree, jsonOut, raw bool, aliases map[string]string, keyToAlias map[string]string, confirmMap ConfirmMap) error {
	if showAliasOnly {
		if jsonOut {
			fmt.Println(format.ToJSON(aliases))
			return nil
		}
		if len(aliases) == 0 {
			fmt.Println("No aliases found.")
			return nil
		}
		fmt.Print(format.FormatAliases(aliases))
		return nil
	}

	data := store.LoadData()
	if len(data) == 0 {
		fmt.Println(format.NoEntriesMessage("ccli"))
		return nil
	}

	flat := store.FlattenObject(data, "")

	if jsonOut {
		// Mask encrypted, interpolate
		masked := make(map[string]string, len(flat))
		for k, v := range flat {
			if crypto.IsEncrypted(v) {
				masked[k] = "[encrypted]"
			} else {
				resolved := interpolateValue(v)
				masked[k] = resolved
			}
		}
		fmt.Println(format.ToJSON(masked))
		return nil
	}

	if raw {
		for k, v := range flat {
			if crypto.IsEncrypted(v) {
				fmt.Printf("%s: [encrypted]\n", k)
			} else {
				fmt.Printf("%s: %s\n", k, v)
			}
		}
		return nil
	}

	fmt.Print(format.FormatEntries(flat, keyToAlias, confirmMap))
	return nil
}

func getSpecificKey(key string, tree, raw, source, decrypt, copyFlag, jsonOut bool, aliases map[string]string, keyToAlias map[string]string, confirmMap ConfirmMap) error {
	val, ok := store.GetValue(key)
	if !ok {
		if jsonOut {
			errJSON, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("Entry '%s' not found", key)})
			fmt.Fprintln(os.Stderr, string(errJSON))
			os.Exit(1)
		}
		return fmt.Errorf("entry '%s' not found", key)
	}

	// Value is an object (subtree)
	if m, ok := val.(map[string]any); ok {
		flat := store.FlattenObject(m, key)

		if jsonOut {
			masked := make(map[string]string, len(flat))
			for k, v := range flat {
				if crypto.IsEncrypted(v) {
					masked[k] = "[encrypted]"
				} else {
					masked[k] = interpolateValue(v)
				}
			}
			fmt.Println(format.ToJSON(masked))
			return nil
		}

		if copyFlag {
			fmt.Println(format.Warning("Copy only works with single values, not subtrees."))
		}

		if len(flat) == 0 {
			fmt.Printf("No entries found under '%s'.\n", key)
			return nil
		}

		fmt.Print(format.FormatEntries(flat, keyToAlias, confirmMap))
		return nil
	}

	// Value is a string
	strVal, _ := val.(string)

	// Handle decryption
	if crypto.IsEncrypted(strVal) && decrypt {
		password, err := askPassword("Password: ")
		if err != nil {
			return err
		}
		decrypted, err := crypto.DecryptValue(strVal, password)
		if err != nil {
			return fmt.Errorf("decryption failed. Wrong password or corrupted data")
		}
		strVal = decrypted
	}

	// Interpolate (unless --source or encrypted)
	displayVal := strVal
	if !source && !crypto.IsEncrypted(strVal) {
		displayVal = interpolateValue(strVal)
	}

	// JSON output
	if jsonOut {
		out := map[string]string{key: displayVal}
		if crypto.IsEncrypted(strVal) && !decrypt {
			out[key] = "[encrypted]"
		}
		fmt.Println(format.ToJSON(out))
		return nil
	}

	// Copy to clipboard
	if copyFlag {
		copyVal := displayVal
		if crypto.IsEncrypted(strVal) && !decrypt {
			copyVal = "[encrypted]"
		}
		// Use pbcopy/xclip/xsel
		if err := copyToClipboard(copyVal); err != nil {
			return fmt.Errorf("failed to copy to clipboard: %w", err)
		}
		fmt.Println("Copied to clipboard.")
		return nil
	}

	// Raw output
	if raw {
		fmt.Println(displayVal)
		return nil
	}

	// Default formatted output
	aliasName := keyToAlias[key]
	fmt.Println(format.FormatSingleEntry(key, displayVal, aliasName, confirmMap[key]))
	return nil
}

// interpolateValue resolves ${...} patterns in a value.
func interpolateValue(value string) string {
	resolved, err := store.Interpolate(
		value,
		alias.ResolveKey,
		store.GetValue,
		crypto.IsEncrypted,
	)
	if err != nil {
		debugLog("interpolation error: %v", err)
		return value
	}
	return resolved
}

// copyToClipboard copies text to the system clipboard.
func copyToClipboard(text string) error {
	// Try common clipboard commands
	for _, cmd := range []struct {
		name string
		args []string
	}{
		{"pbcopy", nil},                         // macOS
		{"xclip", []string{"-selection", "c"}},  // Linux X11
		{"xsel", []string{"--clipboard", "-i"}}, // Linux X11 alt
		{"wl-copy", nil},                        // Wayland
	} {
		path, err := execLookPath(cmd.name)
		if err != nil || path == "" {
			continue
		}
		return execPipe(cmd.name, cmd.args, text)
	}
	return fmt.Errorf("no clipboard utility found (install xclip, xsel, or wl-copy)")
}
