---
Title: 'Build, lint, CI and release for a Go server that embeds a wasm workbench'
Ticket: JIG-007-GO-PLUMBING
Status: active
Topics:
    - build
    - ci
    - go
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: Makefile
      Note: web, build, build-bin, test-go, test-js, lint, goreleaser targets
    - Path: .goreleaser.yaml
      Note: embedded binary for linux/darwin × amd64/arm64; publishing disabled
    - Path: .github/workflows/push.yml
      Note: go test; web build, JS tests, embedded binary and smoke test
    - Path: .github/workflows/lint.yml
      Note: gofmt and golangci-lint at the pinned version
    - Path: cmd/jigcad/main.go
      Note: --version (main.version set by ldflags)
ExternalSources: []
Summary: "The jig repository had no Makefile, lint configuration, CI or release configuration. This ticket adds them, adapted from the go-go-golems scaffold to a binary that embeds a JavaScript/Rust/wasm workbench; publishing is deliberately left for the Vault release design."
LastUpdated: 2026-10-31T23:40:00-04:00
WhatFor: "How jig is built, checked and packaged, and what remains before a published release"
WhenToUse: "When changing the build, adding a CI job, or preparing the first tagged release"
---

# Build, lint, CI and release for a Go server that embeds a wasm workbench

## 1. Starting point

Before this ticket the repository root held `cmd/`, `pkg/`, `import/`, `ttmp/`, `go.mod` and a `.gitignore`. Building
a usable binary took knowledge spread over diaries:

1. Install esbuild somewhere (`build.mjs` reads `ESBUILD=…/esbuild/lib/main.js`; there is no `package.json`).
2. `gunzip -k vendor/occt/replicad_single.wasm.gz` (OpenCascade is committed gzipped; the Node tests read the unpacked file).
3. `cargo build --release --target wasm32-unknown-unknown` for jig-compute (`build.mjs` runs it when cargo exists).
4. `node build.mjs` in `import/jigcad` → `dist/` (app.js, worker.js, jig_compute.wasm, occt/, fonts/).
5. `go build -tags embed ./cmd/jigcad`: `import/jigcad/embed.go` embeds `dist/` only with that tag; without it
   `jigcad serve` reads `--dist` from disk.

Nothing checked the Go code beyond `go test`, and nothing ran the JavaScript suites automatically.

## 2. What the go-go-golems scaffold gives and what does not apply

The scaffold (`go-go-golems-project-setup` skill) provides a Makefile, `.golangci.yml`, a pinned
`.golangci-lint-version`, lefthook hooks, CI workflows, a GoReleaser configuration with Homebrew, signing, deb/rpm and
fury.io publishing, and logcopter/glazed-lint targets. jig takes the lint configuration and version pin unchanged
and adapts the rest:

| Scaffold part | jig | Reason |
|---|---|---|
| `.golangci.yml`, `.golangci-lint-version` (v2.12.2) | as is | the house lint set (errcheck, govet, staticcheck, unused, exhaustive, nonamedreturns, predeclared, gofmt) |
| Makefile `lint`, `test`, `build`, `build-bin`, `goreleaser` | adapted | the binary needs the web build first; JS tests added |
| glazed-lint, logcopter | dropped | jig uses neither glazed commands nor logcopter areas |
| push.yml smoke (`go run ./cmd/<bin> --help`) | replaced | the smoke test serves the embedded workbench and probes the API |
| GoReleaser builds | adapted | `-tags=embed`, `make web` as a before-hook, version by ldflags |
| signs, brews, nfpms, publishers, release.yaml workflow | not added | need credentials; see §5 |
| lefthook | not added | a pre-push snapshot release takes a minute with the web build; CI covers the same checks |

## 3. The Makefile

The targets follow the build's dependency order:

```text
esbuild (.bin/esbuild, npm install esbuild@0.25.12) ─┐
occt (gunzip replicad_single.wasm.gz) ───────────────┼─> web (node build.mjs) ─> build-bin (go build -tags embed)
                                                     │                        ─> test-js
build (go build ./...)          test-go (go test)    └─> serve (go run … serve --dist)
lint = golangci-lint-install + gofmt + golangci-lint run      goreleaser (snapshot, single target)
```

- **esbuild is installed, not vendored.** `make esbuild` installs the pinned version into `.bin/esbuild`
  (git-ignored) and `make web` passes `ESBUILD=` to `build.mjs`, so a fresh clone builds with Node and npm alone.
- **Rust is optional.** `build.mjs` builds jig-compute when cargo is present and warns otherwise; the workbench then
  uses its JavaScript implementations. CI installs Rust with the wasm target so the released binary has the Rust core.
- **`test-js` runs every suite that needs no network:** `test/agent/*.test.mjs` (the agent against the mock host),
  `test/agent-eval/harness.test.mjs` (the harness self-test and every case's oracle on the real engine),
  `test/engine-core/run.mjs` and `test/engine/run.mjs` (the engine on OpenCascade). Locally: 44 + 14 + 62 + 42 tests in 32 s.
- **`golangci-lint-install`** installs the pinned version into `.bin/` only when the binary there reports another
  version, so `make lint` does not reinstall each time.

## 4. CI

Two workflows, both on pushes to `main` and on pull requests, with `contents: read`:

- `push.yml` › `go`: `make test-go`.
- `push.yml` › `web`: Go, Node 24, Rust stable with `wasm32-unknown-unknown` (cached), then `make web`,
  `make test-js`, `make build-bin`, and a smoke test of the embedded binary: `--version`, `serve --no-models`, the
  page title from `/`, and `"available":false` from `/api/sample/models`.
- `lint.yml`: `make gofmt`, then `golangci-lint-action` at the version read from `.golangci-lint-version`.

The agent evaluation against real models is not in CI: it needs lunaroute credentials and minutes of model time per
run. `make agent-eval-oracle` runs the harness with every case's oracle instead (no network), and `test-js` already
covers the same oracles.

`actionlint` passes on both workflows. They have not run on GitHub yet: the repository is pushed by its owner.

## 5. Release: built, not published

`.goreleaser.yaml` builds `jigcad` for linux and darwin on amd64 and arm64 with `CGO_ENABLED=0`, `-tags=embed`,
`-trimpath` and `-X main.version={{ .Version }}`, after `go mod tidy` and `make web`, and archives the binary with
`README.md` and `import/jigcad/BUILD.md`. `goreleaser check` validates it, and `make goreleaser` (snapshot, single
target) produced `jigcad_0.0.1-next_linux_amd64.tar.gz` whose binary reports `jigcad version 0.0.1-next`.

`release.disable: true` is deliberate. Publishing a GitHub release from CI, a Homebrew formula in
`go-go-golems/homebrew-go-go-go`, or signed packages needs credentials. The go-go-golems standard for these is the
Vault-backed design in `go-go-parc/Research/playbooks/infra/PLAYBOOK - Vault Backed Go Binary Releases.md`:
Terraform-managed `release-jig-builder` and `release-jig-publisher` roles bound to the repository, the tag ref and
the workflow ref; the caller's `GITHUB_TOKEN` for the release; a GitHub App token, minted in the publisher job, for
the tap. Creating those roles is a Terraform change in another repository and an authorization decision, not
plumbing. The remaining steps are:

1. Decide whether jigcad gets a Homebrew formula (the binary needs Pi's agent directory to run models).
2. Add the two Vault roles in `terraform/vault/github-actions/envs/k3s` and plan/apply them.
3. Add `release.yaml` calling the shared publisher workflow; remove `release.disable`; add `brews`.
4. Cut a controlled `v0.1.0` and record the run.

## 6. Code changes outside the plumbing

- `cmd/jigcad/main.go`: `var version = "dev"`, `Version: version` on the root command (`jigcad --version`), and
  `defer func() { _ = b.Close() }()` for the one errcheck finding.
- `README.md` at the root (the archive includes it; the repository had none).
