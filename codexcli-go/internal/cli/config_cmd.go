package cli

import (
	"fmt"
	"runtime"
	"strings"

	"github.com/seabearDEV/codexcli-go/internal/config"
	"github.com/seabearDEV/codexcli-go/internal/fileutil"
	"github.com/seabearDEV/codexcli-go/internal/format"
	"github.com/seabearDEV/codexcli-go/internal/store"
	"github.com/spf13/cobra"
)

func newConfigCmd() *cobra.Command {
	configCmd := &cobra.Command{
		Use:   "config",
		Short: "Manage configuration",
		RunE: func(cmd *cobra.Command, args []string) error {
			// Show all config
			cfg := config.Load()
			fmt.Printf("colors: %v\n", cfg.Colors)
			fmt.Printf("theme: %s\n", cfg.Theme)
			return nil
		},
	}

	// config set
	setCmd := &cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a configuration value",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := config.SetSetting(args[0], args[1]); err != nil {
				return err
			}
			fmt.Println(format.Success(fmt.Sprintf("Config '%s' set to '%s'.", args[0], args[1])))
			return nil
		},
	}

	// config get
	getCmd := &cobra.Command{
		Use:   "get [key]",
		Short: "Get a configuration value",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				cfg := config.Load()
				fmt.Printf("colors: %v\n", cfg.Colors)
				fmt.Printf("theme: %s\n", cfg.Theme)
				return nil
			}
			val := config.GetSetting(args[0])
			if val == nil {
				return fmt.Errorf("unknown configuration key: %s", args[0])
			}
			fmt.Printf("%v\n", val)
			return nil
		},
	}

	// config info
	infoCmd := &cobra.Command{
		Use:   "info",
		Short: "Show version and storage information",
		RunE: func(cmd *cobra.Command, args []string) error {
			flat := store.GetEntriesFlat()
			fmt.Printf("Version: %s\n", Version)
			fmt.Printf("Commit: %s\n", Commit)
			fmt.Printf("Go: %s\n", runtime.Version())
			fmt.Printf("OS/Arch: %s/%s\n", runtime.GOOS, runtime.GOARCH)
			fmt.Printf("Data directory: %s\n", fileutil.GetDataDirectory())
			fmt.Printf("Entries: %d\n", len(flat))
			return nil
		},
	}

	// config examples
	examplesCmd := &cobra.Command{
		Use:   "examples",
		Short: "Show usage examples",
		Run: func(cmd *cobra.Command, args []string) {
			examples := []string{
				"# Store a value",
				"ccli set server.ip 192.168.1.100",
				"",
				"# Retrieve a value",
				"ccli get server.ip",
				"",
				"# Store with alias",
				"ccli set server.ip 192.168.1.100 -a ip",
				"",
				"# Encrypt a value",
				"ccli set api.key sk-secret123 -e",
				"",
				"# Search entries",
				"ccli find server",
				"",
				"# Remove an entry",
				"ccli remove server.ip",
				"",
				"# Export all data",
				"ccli data export all -o backup.json",
			}
			fmt.Println(strings.Join(examples, "\n"))
		},
	}

	// config completions
	completionsCmd := &cobra.Command{
		Use:   "completions [bash|zsh|fish|powershell]",
		Short: "Generate shell completions",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			rootCmd := cmd.Root()
			if len(args) == 0 {
				return rootCmd.GenBashCompletion(cmd.OutOrStdout())
			}
			switch args[0] {
			case "bash":
				return rootCmd.GenBashCompletion(cmd.OutOrStdout())
			case "zsh":
				return rootCmd.GenZshCompletion(cmd.OutOrStdout())
			case "fish":
				return rootCmd.GenFishCompletion(cmd.OutOrStdout(), true)
			case "powershell":
				return rootCmd.GenPowerShellCompletionWithDesc(cmd.OutOrStdout())
			default:
				return fmt.Errorf("unsupported shell: %s (use bash, zsh, fish, or powershell)", args[0])
			}
		},
	}

	configCmd.AddCommand(setCmd, getCmd, infoCmd, examplesCmd, completionsCmd)
	return configCmd
}
