package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/seabearDEV/codexcli-go/internal/alias"
	"github.com/seabearDEV/codexcli-go/internal/crypto"
	"github.com/seabearDEV/codexcli-go/internal/fileutil"
	"github.com/seabearDEV/codexcli-go/internal/format"
	"github.com/seabearDEV/codexcli-go/internal/store"
	"github.com/spf13/cobra"
)

func newDataCmd() *cobra.Command {
	dataCmd := &cobra.Command{
		Use:   "data",
		Short: "Export, import, or reset data",
	}

	dataCmd.AddCommand(newDataExportCmd(), newDataImportCmd(), newDataResetCmd())
	return dataCmd
}

func newDataExportCmd() *cobra.Command {
	var (
		output string
		pretty bool
	)

	cmd := &cobra.Command{
		Use:   "export <type>",
		Short: "Export data (entries, aliases, confirm, all)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			dataType := args[0]
			validTypes := map[string]bool{"entries": true, "aliases": true, "confirm": true, "all": true}
			if !validTypes[dataType] {
				return fmt.Errorf("invalid type: '%s'. Use: entries, aliases, confirm, all", dataType)
			}

			exportData := func(typeName string) (string, error) {
				switch typeName {
				case "entries":
					data := store.LoadData()
					masked := crypto.MaskEncryptedValues(data)
					return marshalJSON(masked, pretty)
				case "aliases":
					data := alias.Load()
					return marshalJSON(data, pretty)
				case "confirm":
					data := loadConfirm()
					return marshalJSON(data, pretty)
				default:
					return "", fmt.Errorf("unknown type: %s", typeName)
				}
			}

			if dataType == "all" {
				types := []string{"entries", "aliases", "confirm"}
				for _, t := range types {
					content, err := exportData(t)
					if err != nil {
						return err
					}
					if output != "" {
						ext := filepath.Ext(output)
						base := strings.TrimSuffix(output, ext)
						outFile := fmt.Sprintf("%s-%s%s", base, t, ext)
						if err := os.WriteFile(outFile, []byte(content), 0600); err != nil {
							return err
						}
						fmt.Printf("Exported %s to %s\n", t, outFile)
					} else {
						fmt.Printf("--- %s ---\n%s\n", t, content)
					}
				}
				return nil
			}

			content, err := exportData(dataType)
			if err != nil {
				return err
			}

			if output != "" {
				if err := os.WriteFile(output, []byte(content), 0600); err != nil {
					return err
				}
				fmt.Printf("Exported %s to %s\n", dataType, output)
			} else {
				fmt.Println(content)
			}
			return nil
		},
	}

	cmd.Flags().StringVarP(&output, "output", "o", "", "Output file path")
	cmd.Flags().BoolVar(&pretty, "pretty", false, "Pretty-print JSON")

	return cmd
}

func newDataImportCmd() *cobra.Command {
	var (
		merge bool
		force bool
	)

	cmd := &cobra.Command{
		Use:   "import <type> <file>",
		Short: "Import data from a file",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			dataType := args[0]
			filePath := args[1]

			data, err := os.ReadFile(filePath)
			if err != nil {
				return fmt.Errorf("failed to read file: %w", err)
			}

			if !force && isTTY() {
				action := "replace"
				if merge {
					action = "merge into"
				}
				if !askConfirmation(fmt.Sprintf("This will %s existing %s. Continue? [y/N] ", action, dataType)) {
					fmt.Println("Aborted.")
					return nil
				}
			}

			switch dataType {
			case "entries":
				var imported map[string]any
				if err := json.Unmarshal(data, &imported); err != nil {
					return fmt.Errorf("invalid JSON: %w", err)
				}
				if merge {
					existing := store.LoadData()
					for k, v := range imported {
						existing[k] = v
					}
					return store.SaveData(existing)
				}
				return store.SaveData(imported)

			case "aliases":
				var imported map[string]string
				if err := json.Unmarshal(data, &imported); err != nil {
					return fmt.Errorf("invalid JSON: %w", err)
				}
				if merge {
					existing := alias.Load()
					for k, v := range imported {
						existing[k] = v
					}
					return alias.Save(existing)
				}
				return alias.Save(imported)

			case "confirm":
				var imported ConfirmMap
				if err := json.Unmarshal(data, &imported); err != nil {
					return fmt.Errorf("invalid JSON: %w", err)
				}
				if merge {
					existing := loadConfirm()
					for k, v := range imported {
						existing[k] = v
					}
					return saveConfirm(existing)
				}
				return saveConfirm(imported)

			default:
				return fmt.Errorf("invalid type: '%s'. Use: entries, aliases, confirm", dataType)
			}
		},
	}

	cmd.Flags().BoolVarP(&merge, "merge", "m", false, "Merge with existing data")
	cmd.Flags().BoolVarP(&force, "force", "f", false, "Skip confirmation")

	return cmd
}

func newDataResetCmd() *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:   "reset <type>",
		Short: "Reset data to empty (entries, aliases, confirm, all)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			dataType := args[0]
			validTypes := map[string]bool{"entries": true, "aliases": true, "confirm": true, "all": true}
			if !validTypes[dataType] {
				return fmt.Errorf("invalid type: '%s'. Use: entries, aliases, confirm, all", dataType)
			}

			if !force && isTTY() {
				if !askConfirmation(fmt.Sprintf("This will permanently delete all %s. Continue? [y/N] ", dataType)) {
					fmt.Println("Aborted.")
					return nil
				}
			}

			// Auto-backup before destructive operation
			fileutil.CreateAutoBackup("reset-" + dataType)

			resetType := func(t string) error {
				switch t {
				case "entries":
					return store.SaveData(make(store.CodexData))
				case "aliases":
					return alias.Save(make(alias.AliasMap))
				case "confirm":
					return saveConfirm(make(ConfirmMap))
				default:
					return nil
				}
			}

			if dataType == "all" {
				for _, t := range []string{"entries", "aliases", "confirm"} {
					if err := resetType(t); err != nil {
						return err
					}
				}
			} else {
				if err := resetType(dataType); err != nil {
					return err
				}
			}

			fmt.Println(format.Success(fmt.Sprintf("Data '%s' has been reset.", dataType)))
			return nil
		},
	}

	cmd.Flags().BoolVarP(&force, "force", "f", false, "Skip confirmation")

	return cmd
}

func marshalJSON(v any, pretty bool) (string, error) {
	if pretty {
		b, err := json.MarshalIndent(v, "", "  ")
		return string(b), err
	}
	b, err := json.Marshal(v)
	return string(b), err
}
