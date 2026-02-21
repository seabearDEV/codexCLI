package cli

import (
	"fmt"
	"strings"

	"github.com/seabearDEV/codexcli-go/internal/alias"
	"github.com/seabearDEV/codexcli-go/internal/crypto"
	"github.com/seabearDEV/codexcli-go/internal/format"
	"github.com/seabearDEV/codexcli-go/internal/store"
	"github.com/spf13/cobra"
)

func newFindCmd() *cobra.Command {
	var (
		entries  bool
		aliases  bool
		tree     bool
		jsonOut  bool
	)

	cmd := &cobra.Command{
		Use:     "find <term>",
		Aliases: []string{"f"},
		Short:   "Search entries and aliases",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			term := args[0]
			lowerTerm := strings.ToLower(term)

			searchEntries := entries || (!entries && !aliases)
			searchAliases := aliases || (!entries && !aliases)

			var matchedEntries map[string]string
			var matchedAliases map[string]string

			if searchEntries {
				flat := store.GetEntriesFlat()
				matchedEntries = make(map[string]string)
				for k, v := range flat {
					keyMatch := strings.Contains(strings.ToLower(k), lowerTerm)
					valMatch := !crypto.IsEncrypted(v) && strings.Contains(strings.ToLower(v), lowerTerm)
					if keyMatch || valMatch {
						matchedEntries[k] = v
					}
				}
			}

			if searchAliases {
				all := alias.Load()
				matchedAliases = make(map[string]string)
				for name, target := range all {
					nameMatch := strings.Contains(strings.ToLower(name), lowerTerm)
					targetMatch := strings.Contains(strings.ToLower(target), lowerTerm)
					if nameMatch || targetMatch {
						matchedAliases[name] = target
					}
				}
			}

			if jsonOut {
				result := make(map[string]any)
				if matchedEntries != nil {
					result["entries"] = matchedEntries
				}
				if matchedAliases != nil {
					result["aliases"] = matchedAliases
				}
				fmt.Println(format.ToJSON(result))
				return nil
			}

			found := false

			if len(matchedEntries) > 0 {
				found = true
				if searchAliases {
					fmt.Println("Entries:")
				}
				// Display with highlighting
				keyToAlias := alias.BuildKeyToAliasMap(alias.Load())
				confirmMap := loadConfirm()
				for k, v := range matchedEntries {
					displayKey := format.HighlightMatch(k, term)
					displayVal := v
					if crypto.IsEncrypted(v) {
						displayVal = "[encrypted]"
					} else {
						displayVal = format.HighlightMatch(v, term)
					}
					aliasName := keyToAlias[k]
					_ = confirmMap
					fmt.Printf("%s: %s", displayKey, displayVal)
					if aliasName != "" {
						fmt.Printf(" (%s)", aliasName)
					}
					fmt.Println()
				}
			}

			if len(matchedAliases) > 0 {
				found = true
				if found && len(matchedEntries) > 0 {
					fmt.Println()
				}
				if searchEntries {
					fmt.Println("Aliases:")
				}
				for name, target := range matchedAliases {
					fmt.Printf("%s: %s\n",
						format.HighlightMatch(name, term),
						format.HighlightMatch(target, term))
				}
			}

			if !found {
				fmt.Printf("No results found for '%s'.\n", term)
			}

			return nil
		},
	}

	cmd.Flags().BoolVarP(&entries, "entries", "e", false, "Search entries only")
	cmd.Flags().BoolVarP(&aliases, "aliases", "a", false, "Search aliases only")
	cmd.Flags().BoolVarP(&tree, "tree", "t", false, "Display as tree")
	cmd.Flags().BoolVarP(&jsonOut, "json", "j", false, "Output as JSON")

	return cmd
}
