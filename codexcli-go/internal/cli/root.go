package cli

import (
	"fmt"
	"os"

	"github.com/seabearDEV/codexcli-go/internal/config"
	"github.com/seabearDEV/codexcli-go/internal/format"
	"github.com/spf13/cobra"
)

var (
	// Version is set at build time via ldflags.
	Version = "dev"
	// Commit is set at build time via ldflags.
	Commit = "none"
	// Debug enables debug output when true.
	Debug bool
)

// NewRootCmd creates the root cobra command with all subcommands registered.
func NewRootCmd() *cobra.Command {
	rootCmd := &cobra.Command{
		Use:     "ccli",
		Short:   "A CLI tool for storing and retrieving code snippets, commands, and knowledge",
		Version: Version,
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			if Debug {
				os.Setenv("DEBUG", "true")
			}
			// Apply color settings from config
			cfg := config.Load()
			format.SetColorsEnabled(cfg.Colors)
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	rootCmd.PersistentFlags().BoolVar(&Debug, "debug", false, "Enable debug output")
	rootCmd.SetVersionTemplate(fmt.Sprintf("ccli version %s (commit: %s)\n", Version, Commit))

	// Register commands
	rootCmd.AddCommand(
		newSetCmd(),
		newGetCmd(),
		newRemoveCmd(),
		newFindCmd(),
		newRenameCmd(),
		newConfigCmd(),
		newDataCmd(),
	)

	return rootCmd
}

// Execute runs the root command.
func Execute() {
	cmd := NewRootCmd()
	if err := cmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, format.Error(err.Error()))
		os.Exit(1)
	}
}

// debugLog prints a debug message if debug mode is enabled.
func debugLog(format string, args ...any) {
	if Debug || os.Getenv("DEBUG") == "true" {
		fmt.Fprintf(os.Stderr, "[debug] "+format+"\n", args...)
	}
}

// stripTrailingColon removes a trailing colon from a key.
func stripTrailingColon(key string) string {
	if len(key) > 0 && key[len(key)-1] == ':' {
		return key[:len(key)-1]
	}
	return key
}
