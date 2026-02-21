package main

import "github.com/seabearDEV/codexcli-go/internal/cli"

// version and commit are set at build time via ldflags.
var (
	version = "dev"
	commit  = "none"
)

func main() {
	cli.Version = version
	cli.Commit = commit
	cli.Execute()
}
