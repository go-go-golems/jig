---
Title: Diary
Ticket: JIG-007-GO-PLUMBING
Status: active
Topics:
    - build
    - ci
    - go
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://Makefile
      Note: build, test, lint and release targets
    - Path: repo://.goreleaser.yaml
      Note: embedded binary, publishing disabled
    - Path: repo://.github/workflows/push.yml
      Note: CI
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T23:23:01.221676425-04:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

# Diary

## Step 1: Makefile, lint, CI and GoReleaser adapted to an embedded wasm workbench

The repository had no build plumbing. I took the go-go-golems scaffold's lint configuration and its version pin as
they are, and adapted the Makefile, CI and GoReleaser to the one thing that makes jig different: the binary embeds a
workbench built by esbuild, cargo and a gunzip. Everything was validated locally: lint, the embedded binary's smoke
test, all JS suites, `goreleaser check`, a snapshot release and actionlint. Publishing stays disabled until the Vault
release roles exist.

### Prompt Context
**User prompt (verbatim):** see JIG-004 diary, Step 1 ("Do 1, 2, 3, 4. …").
**Assistant interpretation:** Item 4: Makefile, lint, CI and a GoReleaser binary for the Go project.
**Inferred user intent:** A repository that builds, checks and packages itself without diary knowledge.
**Commit (code):** the commit that adds this step — "JIG-007: Makefile, golangci-lint, CI and GoReleaser for the embedded jigcad binary"

### What I did
- Read the scaffold (`go-go-golems-project-setup/assets/scaffold`): Makefile, `.golangci.yml`, `.golangci-lint-version` (v2.12.2), workflows, `.goreleaser.yaml`, lefthook, logcopter.
- Copied `.golangci.yml` and `.golangci-lint-version`; ran the installed golangci-lint (2.4.0) first: one finding, `cmd/jigcad/main.go:96:16: Error return value of \`b.Close\` is not checked (errcheck)`; fixed with `defer func() { _ = b.Close() }()`.
- Added `var version = "dev"` and `Version: version` to the root command.
- Wrote `Makefile` (esbuild into `.bin/`, occt gunzip, web, build, build-bin, serve, test-go, test-js, agent-eval-oracle, lint, gofmt, goreleaser-check, goreleaser), `.goreleaser.yaml`, `.github/workflows/push.yml` and `lint.yml`, `README.md`, `.gitignore` entries (`/.bin/`, `/dist/`, `.playwright-mcp/`).
- Design doc with the scaffold comparison table and the release plan.

### Why
- esbuild installed by version into `.bin/` instead of vendoring: `build.mjs` already takes `ESBUILD=`, and the repo has no npm project.
- Publishing disabled rather than half-configured: a tag push should not attempt a release that has no credentials.

### What worked
- `make golangci-lint-install` installed v2.12.2 into `.bin/`; `make lint` → `0 issues.`
- `make build-bin` → `dist/jigcad` 32 MB, `jigcad version 8bcb879-dirty`; started from `/tmp` it logged `jigcad serving the embedded workbench on http://127.0.0.1:8790/ (models: false, …)`, served the title, `jig_compute.wasm` (200, 166,056 bytes) and `/api/sample/models` with `"available":false`.
- `make test-js` → agent `pass 44`, harness `pass 14`, engine core `62 passed, 0 failed`, engine `42 passed, 0 failed`; 31.7 s.
- `goreleaser check` → `1 configuration file(s) validated`; `make goreleaser` → `dist/linux_amd64/jigcad_0.0.1-next_linux_amd64.tar.gz` with `README.md`, `import/jigcad/BUILD.md`, `jigcad`; the binary reports `0.0.1-next`.

### What didn't work
- `actionlint` on the first push.yml: `shellcheck reported issue in this script: SC2034:warning:4:1: i appears unused`; the wait loop now uses `_`.

### What I learned
- GoReleaser Pro with `--single-target` writes into `dist/<os>_<arch>/`, not `dist/` directly.

### What was tricky to build
- The order of artefacts: `build-bin` and `test-js` both depend on `web` (the harness needs `src/generated/content.json`, the engine tests the unpacked OCCT wasm), and the GoReleaser before-hook must run the same `make web` so a release cannot embed a stale `dist/`.

### What warrants a second pair of eyes
- The CI workflows have not run on GitHub (the repository is pushed by its owner); action versions (`checkout@v6`, `setup-go@v6`, `setup-node@v5`, `golangci-lint-action@v9`) follow the scaffold and should be confirmed on the first run.

### What should be done in the future
- The Vault release roles and `release.yaml` (design doc §5).

### Code review instructions
- `make lint test build-bin goreleaser-check`; `actionlint .github/workflows/*.yml`.

### Technical details
- Go packages linted and tested: `./cmd/... ./pkg/... ./import/...` (`import/jigcad` holds `dist.go`/`embed.go`).
