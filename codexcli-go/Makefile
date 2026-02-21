VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT)

.PHONY: build dev clean test lint

# Build production binary
build:
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o bin/ccli ./cmd/ccli

# Build dev binary (named cclid for dev-mode path resolution)
dev:
	go build -ldflags "$(LDFLAGS)" -o bin/cclid ./cmd/ccli

# Run tests
test:
	go test ./...

# Run tests with verbose output
test-v:
	go test -v ./...

# Clean build artifacts
clean:
	rm -rf bin/

# Install to GOPATH/bin
install:
	CGO_ENABLED=0 go install -ldflags "$(LDFLAGS)" ./cmd/ccli

# Run linter (requires golangci-lint)
lint:
	golangci-lint run ./...
