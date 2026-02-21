package cli

import (
	"fmt"

	"github.com/seabearDEV/codexcli-go/internal/alias"
	"github.com/seabearDEV/codexcli-go/internal/format"
	"github.com/seabearDEV/codexcli-go/internal/store"
	"github.com/spf13/cobra"
)

func newRemoveCmd() *cobra.Command {
	var (
		isAlias bool
		force   bool
	)

	cmd := &cobra.Command{
		Use:     "remove <key>",
		Aliases: []string{"rm"},
		Short:   "Remove an entry or alias",
		Args:    cobra.ExactArgs(1),
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
			key := args[0]

			// Alias removal
			if isAlias {
				if alias.RemoveAlias(key) {
					fmt.Println(format.Success(fmt.Sprintf("Alias '%s' removed successfully.", key)))
					return nil
				}
				return fmt.Errorf("alias '%s' not found", key)
			}

			// Entry removal
			key = stripTrailingColon(key)
			key = alias.ResolveKey(key)

			_, ok := store.GetValue(key)
			if !ok {
				fmt.Println(format.Warning(fmt.Sprintf("Entry '%s' not found.", key)))
				return nil
			}

			if !force && isTTY() {
				if !askConfirmation(fmt.Sprintf("Remove '%s'? [y/N] ", key)) {
					fmt.Println("Aborted.")
					return nil
				}
			}

			// Cascade delete
			removed, err := store.RemoveValue(key)
			if err != nil {
				return err
			}
			if removed {
				alias.RemoveAliasesForKey(key)
				removeConfirmForKey(key)
				fmt.Println(format.Success(fmt.Sprintf("Entry '%s' removed successfully.", key)))
			}

			return nil
		},
	}

	cmd.Flags().BoolVarP(&isAlias, "alias", "a", false, "Remove an alias instead of an entry")
	cmd.Flags().BoolVarP(&force, "force", "f", false, "Skip confirmation prompt")

	return cmd
}
