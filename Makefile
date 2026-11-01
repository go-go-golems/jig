# jig: the jigcad workbench (JavaScript, Rust → wasm) and its Go server (jigcad serve).
#
#   make web           build import/jigcad/dist (esbuild bundle, jig-compute wasm, OpenCascade wasm)
#   make build         go build ./... (the server reads dist/ from disk: jigcad serve --dist)
#   make build-bin     ./dist/jigcad with the workbench embedded (-tags embed; runs `make web` first)
#   make test          Go tests and the JavaScript suites that need no network
#   make lint          golangci-lint (pinned in .golangci-lint-version) and gofmt
#   make goreleaser    a local snapshot release for this platform (no publishing)
#
# Tools: Go (go.mod), Node 24 (no npm packages in the repo; esbuild is installed into .bin/ by `make esbuild`),
# Rust with the wasm32-unknown-unknown target (optional: without it dist/ runs the JS implementations).

.PHONY: all web esbuild occt build build-bin test test-go test-js lint lint-fix golangci-lint-install gofmt \
	goreleaser goreleaser-check serve agent-eval-oracle clean

all: lint test build

BINARY ?= jigcad
MODULE ?= github.com/go-go-golems/jig
CMD_DIR ?= ./cmd/$(BINARY)
WEB ?= import/jigcad
GO_PACKAGES ?= ./cmd/... ./pkg/... ./import/...
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

ESBUILD_VERSION ?= 0.25.12
ESBUILD_DIR ?= $(CURDIR)/.bin/esbuild
ESBUILD ?= $(ESBUILD_DIR)/node_modules/esbuild/lib/main.js

GOLANGCI_LINT_VERSION ?= $(shell cat .golangci-lint-version)
GOLANGCI_LINT_BIN ?= $(CURDIR)/.bin/golangci-lint

GORELEASER_ARGS ?= --snapshot --clean
GORELEASER_TARGET ?= --single-target

# ── the workbench ────────────────────────────────────────────────────────────

$(ESBUILD):
	mkdir -p $(ESBUILD_DIR)
	npm install --silent --no-audit --no-fund --prefix $(ESBUILD_DIR) esbuild@$(ESBUILD_VERSION)

esbuild: $(ESBUILD)

# OpenCascade is committed gzipped; the engine and its Node tests read the unpacked file
$(WEB)/vendor/occt/replicad_single.wasm: $(WEB)/vendor/occt/replicad_single.wasm.gz
	gunzip -kf $<
	touch $@

occt: $(WEB)/vendor/occt/replicad_single.wasm

web: $(ESBUILD) occt
	cd $(WEB) && ESBUILD=$(ESBUILD) node build.mjs

# ── Go ───────────────────────────────────────────────────────────────────────

build:
	GOWORK=off go build $(GO_PACKAGES)

build-bin: web
	mkdir -p ./dist
	GOWORK=off CGO_ENABLED=0 go build -tags embed -ldflags "-s -w -X main.version=$(VERSION)" -o ./dist/$(BINARY) $(CMD_DIR)

serve: web
	GOWORK=off go run $(CMD_DIR) serve --dist $(WEB)/dist

# ── tests ────────────────────────────────────────────────────────────────────

test: test-go test-js

test-go:
	GOWORK=off go test $(GO_PACKAGES) -count=1

# The JavaScript suites without network access: the agent (mock host), the harness self-test and every case's
# oracle on the real engine, the engine core, and the engine on OpenCascade. The harness needs src/generated
# (from `make web`).
test-js: web
	cd $(WEB) && node --test test/agent/*.test.mjs test/ui/*.test.mjs
	cd $(WEB) && node --test test/agent-eval/harness.test.mjs
	cd $(WEB) && node test/engine-core/run.mjs
	cd $(WEB) && node test/engine/run.mjs

agent-eval-oracle: web
	cd $(WEB) && node tools/agent-eval.mjs --oracle

# ── lint ─────────────────────────────────────────────────────────────────────

golangci-lint-install:
	@if [ ! -x $(GOLANGCI_LINT_BIN) ] || ! $(GOLANGCI_LINT_BIN) version 2>/dev/null | grep -q "$(patsubst v%,%,$(GOLANGCI_LINT_VERSION))"; then \
		mkdir -p $(dir $(GOLANGCI_LINT_BIN)); \
		GOBIN=$(dir $(GOLANGCI_LINT_BIN)) go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION); \
	fi

lint: golangci-lint-install gofmt
	GOWORK=off $(GOLANGCI_LINT_BIN) run -v $(GO_PACKAGES)

lint-fix: golangci-lint-install
	GOWORK=off $(GOLANGCI_LINT_BIN) run --fix $(GO_PACKAGES)

gofmt:
	@out=$$(gofmt -l cmd pkg import/jigcad/*.go); if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi

# ── release ──────────────────────────────────────────────────────────────────

goreleaser-check:
	goreleaser check --config .goreleaser.yaml

goreleaser:
	GOWORK=off goreleaser release $(GORELEASER_ARGS) $(GORELEASER_TARGET)

clean:
	rm -rf ./dist ./.bin/esbuild
