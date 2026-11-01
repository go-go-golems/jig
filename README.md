# jig

jigcad is a browser CAD workbench: parts are written in a JavaScript builder language, compiled in a Web Worker with
OpenCascade (wasm) and a Rust numeric core (jig-compute, wasm), and drawn on a software-rendered drafting sheet. An
agent panel edits the part's script through one tool, `eval`, that runs code against the workbench.

`jigcad serve` is the Go server: it serves the workbench and runs the agent's model calls through Pi's agent
directory (`~/.pi/agent`) with geppetto. The default models are `lunaroute/glm-5.3-flash` and
`lunaroute/deepseek-4.1-flash`.

## Build and run

```bash
make web          # import/jigcad/dist: esbuild bundle, jig-compute wasm, OpenCascade wasm
make serve        # go run ./cmd/jigcad serve --dist import/jigcad/dist → http://127.0.0.1:8787/
make build-bin    # ./dist/jigcad with the workbench embedded
make test         # Go tests and the JavaScript suites (no network)
make lint         # golangci-lint (pinned) and gofmt
```

Requirements: Go (see `go.mod`), Node 24 with npm (only to install esbuild into `.bin/`), and optionally Rust with
the `wasm32-unknown-unknown` target for jig-compute.

## Layout

- `cmd/jigcad`: the CLI (`jigcad serve`).
- `pkg/server`: the HTTP API (`POST /api/sample` streamed as server-sent events, tool results, cancel).
- `pkg/sample`, `pkg/sample/gepp`: the model-call contract and its geppetto/Pi backend.
- `import/jigcad`: the workbench (see `import/jigcad/BUILD.md`), its tests, and the agent evaluation harness
  (`tools/agent-eval.mjs`).
- `ttmp/`: tickets with design documents and diaries (docmgr).
