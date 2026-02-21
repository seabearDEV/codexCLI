package cli

import (
	"fmt"

	"github.com/seabearDEV/codexcli-go/internal/alias"
	"github.com/seabearDEV/codexcli-go/internal/format"
	"github.com/seabearDEV/codexcli-go/internal/store"
	"github.com/spf13/cobra"
)

func newRenameCmd() *cobra.Command {
	var (
		isAlias  bool
		setAlias string
	)

	cmd := &cobra.Command{
		Use:     "rename <old> <new>",
		Aliases: []string{"rn"},
		Short:   "Rename an entry or alias",
		Args:    cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			oldKey := stripTrailingColon(args[0])
			newKey := stripTrailingColon(args[1])

			// Alias rename
			if isAlias {
				if alias.RenameAlias(oldKey, newKey) {
					fmt.Println(format.Success(fmt.Sprintf("Alias '%s' renamed to '%s'.", oldKey, newKey)))
					return nil
				}
				return fmt.Errorf("could not rename alias '%s' to '%s' (source missing or target exists)", oldKey, newKey)
			}

			// Entry rename
			resolvedOld := alias.ResolveKey(oldKey)
			val, ok := store.GetValue(resolvedOld)
			if !ok {
				return fmt.Errorf("entry '%s' not found", oldKey)
			}

			// Check target doesn't exist
			if _, exists := store.GetValue(newKey); exists {
				return fmt.Errorf("entry '%s' already exists", newKey)
			}

			// Move the data
			data := store.LoadData()
			store.SetNestedValue(data, newKey, serializeValue(val))
			store.RemoveNestedValue(data, resolvedOld)
			if err := store.SaveData(data); err != nil {
				return err
			}

			// Move aliases that pointed to old key
			aliases := alias.Load()
			for name, target := range aliases {
				if target == resolvedOld {
					aliases[name] = newKey
				}
			}
			_ = alias.Save(aliases)

			// Move confirm metadata
			if hasConfirm(resolvedOld) {
				removeConfirm(resolvedOld)
				setConfirm(newKey)
			}

			fmt.Println(format.Success(fmt.Sprintf("Entry '%s' renamed to '%s'.", oldKey, newKey)))

			// Optionally set alias
			if setAlias != "" {
				alias.SetAlias(setAlias, newKey)
			}

			return nil
		},
	}

	cmd.Flags().BoolVarP(&isAlias, "alias", "a", false, "Rename an alias")
	cmd.Flags().StringVar(&setAlias, "set-alias", "", "Set alias for the new key")

	return cmd
}

// serializeValue converts a CodexValue back to a string for re-insertion.
func serializeValue(val any) string {
	if s, ok := val.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", val)
}
