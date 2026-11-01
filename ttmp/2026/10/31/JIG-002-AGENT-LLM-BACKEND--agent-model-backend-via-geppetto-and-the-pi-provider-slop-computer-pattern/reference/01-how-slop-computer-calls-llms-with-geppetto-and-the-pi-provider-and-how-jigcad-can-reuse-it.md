---
Title: How slop-computer calls LLMs with geppetto and the pi provider, and how jigcad can reuse it
Ticket: JIG-002-AGENT-LLM-BACKEND
Status: active
Topics:
    - agent
    - llm
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Findings on slop-computer's geppetto + pi-provider model path (SLOP-010) and two ways to give the jigcad agent a backend."
LastUpdated: 2026-10-31T20:18:44.482201681-04:00
WhatFor: "Choosing and building a model backend for the jigcad agent panel outside claude.ai."
WhenToUse: "Before implementing a sample() backend for src/agent, or when configuring Claude through Pi."
---

# How slop-computer calls LLMs with geppetto and the pi provider, and how jigcad can reuse it

Researched 2026-10-31, read-only. Abbreviations used below:

- `W/` = the worktree `/home/manuel/workspaces/2026-10-28/slop-computer/slop-computer` (detached at 18f97d4; same content as `origin/main`).
- `G/` = `~/go/pkg/mod/github.com/go-go-golems/geppetto@v0.13.13`.

## 1. Which checkout

- `~/code/wesen/slop-computer` (local `main`) is **82 commits behind `origin/main`** and contains no geppetto code.
- The geppetto work came in with SLOP-010 (PR #4) and can be read in `W/`.
- `W/go.mod:88` pins `github.com/go-go-golems/geppetto v0.13.13`. That is the version with `providers/pi` and Anthropic adaptive thinking.

## 2. The jigcad side today

- `src/agent/panel.jsx:60-70` gets the model from `window.claude.use('sample')`, the claude.ai artifact capability. Outside claude.ai that capability does not exist, so the agent is off.
- `src/agent/turn.js:49-80` makes one `sample(turns, opts)` call per turn and expects `{ text, truncated }` back. The options are `{ tools: [evalTool], signal, modelTier, effort, cache: false, onText }`.
- `src/agent/evaltool.js` returns `{ name: 'eval', description, inputSchema, execute(input, { signal }) }`. That is exactly slop's page-tool shape.
- The error codes in `turn.js` already match slop's contract codes.

## 3. slop's model path (Go, geppetto)

### Interface

`W/pkg/piworker/backend.go:93-97` defines the backend:

```go
type Backend interface {
    Models() []Model
    Sample(ctx, Request, emit func(Event), execute ExecuteTool) error
    Close() error
}
type ExecuteTool func(context.Context, Event) (ToolResult, error) // blocks until the browser answers
```

### One call, step by step

The implementation is `gepp.(*Backend).Sample` in `W/pkg/piworker/gepp/sample.go`.

1. **Pick the model and thinking level.** The model is the one named on the page, else the tier's model (`pick`, line 153). The thinking level is the page's `effort`, else a `:level` suffix on the model reference, else Pi's `defaultThinkingLevel` (`level`, line 168).
2. **Resolve the engine.** `b.dir.Resolve(ctx, m.Ref(), pi.ResolveOptions{Thinking: level})` returns a geppetto engine (line 76).
3. **Build the turn.** `toTurn()` (line 234) converts the page's turns into a `*turns.Turn`. It adds no system block, because the page owns the prompt.
4. **Register tools.** Tools go into `tools.NewInMemoryToolRegistry()` as `ToolDefinition{Name, Description, Parameters}` with no `Function`, because they run in the browser.
5. **Run rounds**, at most `rounds` of them (lines 98-148). Each round:
   - sets the per-round output cap via `engine.KeyInferenceConfig`;
   - calls `eng.RunInference(events.WithEventSinks(ctx, sink), t)`;
   - reads the requested tool calls with `toolblocks.ExtractPendingToolCalls`;
   - if there are any, runs them in parallel through `execute` and appends each result with `turns.NewToolUseBlock` or `NewToolUseBlockWithError`.

   The last round offers no tools, so the model has to answer.
6. **Stream events.** The sink (lines 304-353) maps geppetto events to page events:

   | geppetto event | page event |
   |---|---|
   | `EventTextDelta` | `text` (whole text so far + delta) |
   | `EventReasoningDelta` | `thinking` |
   | `EventProviderCallFinished` | `usage`, `truncated` |
   | `EventError` | failure |
7. **Classify errors and enforce limits.** `classify()` (line 391) turns provider errors into one of `authentication_error | rate_limited | prompt_too_large | upstream_error`. Each call has a budget of 65,536 output tokens, and the conversation is capped at 512 KB.

### Why slop does not use geppetto's toolloop

The SLOP-010 intern guide (§7.2) gives three reasons:

- the output budget changes from round to round;
- the tool executor has to block until the browser answers;
- text accumulates across rounds.

The guide is `W/ttmp/2026/10/29/SLOP-010--…/design-doc/01-intern-guide-sample-on-geppetto-with-pi-credentials.md`.

## 4. The pi provider

### What it is

geppetto's `pkg/steps/ai/providers/pi` reads the **Pi coding agent's** directory and turns a `"provider/model"` reference into a geppetto engine, using the credentials Pi has stored.

- Default directory: `~/.pi/agent`. `PI_CODING_AGENT_DIR` overrides it.
- Files it reads (`G/.../providers/pi/agentdir.go:129-157`):

  | File | Contents |
  |---|---|
  | `settings.json` | defaults (provider, model, thinking level, enabled models) |
  | `models-store.json` | the model catalog |
  | `models.json` | user-defined providers `{ baseUrl, api, apiKey, headers, models }` |
  | `auth.json` | API keys or OAuth tokens |

- Values in these files may be `$ENV` (read from the environment) or `!command` (output of a command). Commands run only when the loader is given `pi.WithCommandValues()`.

### How a model becomes an engine

`Resolve` (`resolve.go:61-170`) chooses the engine by the model's `api` field:

| `api` | engine |
|---|---|
| `openai-completions` | OpenAI chat completions |
| `openai-responses` | OpenAI Responses |
| `openai-codex-responses` | Responses plus the Codex transport, with OAuth refresh |
| `anthropic-messages` | `claude.NewClaudeEngine` |
| `google-generative-ai` | Gemini |

### How slop selects it

`W/cmd/slop/cmds/serve.go:198-241`:

- Flags: `--models pi`, plus `--model-quick`, `--model-default` and `--model-complex`, each taking `provider/id[:level]`.
- Startup calls `gepp.New(gepp.Config{ AgentDir, Tiers, Options: { pi.WithEnv(os.LookupEnv), pi.WithCommandValues() } })`.

### Getting Claude through Pi (caveat)

This comes from reading the code; it has not been tested.

- **Claude is not listed today.** The local Pi setup has an `anthropic` OAuth login in `auth.json`, but no `anthropic` provider in either `models-store.json` or `models.json`.
- **The OAuth token would be sent the wrong way.** Even with a provider entry, `credential()` hands the OAuth `access` token over as if it were an API key, and `Resolve` sends it as `x-api-key`. The Claude engine's Bearer/OAuth path is never reached.
- **There is no Anthropic token refresh.**
- **What works today:** a `models.json` provider with `api: "anthropic-messages"` and `apiKey: "$ANTHROPIC_API_KEY"`.
- **Using the OAuth login** would need a fix in geppetto.

### Prompt caching

Not implemented. The Claude engine sends no `cache_control`.

## 5. Browser ↔ server protocol (slop)

### Endpoints

Handlers are in `W/pkg/server/rt_sample.go`.

| Request | Body | Purpose |
|---|---|---|
| `POST /_rt/sample` | `{ input, modelTier, model?, effort?, tools?: [{ name, description, inputSchema }] }` | start a call; the response is an SSE stream |
| `POST /_rt/sample/{call}/tools/{use}` | `{ value, isError }` | answer one tool call |
| `POST /_rt/sample/{call}/cancel` | — | stop the call |

### SSE events, in order

1. `call {call}`
2. `text {text, delta}`
3. `thinking {text, delta}`
4. `tool {use, name, input}`
5. `result {text, truncated, modelTierApplied, …}` or `error {code, message}`

### Tools run in the page

- The server waits up to 150 s for each tool result.
- The client (`W/web/runtime/src/sample.ts:68-183`) reads the SSE body of the POST with `fetch` + `getReader` (not `EventSource`, which only does GET).
- It runs `tool.execute`, caps the result at 32 KB and POSTs it back.
- Abort sends `/cancel`.

### Limits

From `W/pkg/piworker/validate.go`:

- at most 10 rounds and 16 tools;
- each tool schema is at most 4 KB and must have `type: object`;
- tier is `quick`, `default` or `complex`; effort is `low`, `medium` or `high`.

## 6. Options for jigcad

### Option A: host jigcad as a slop app (no new backend)

Push `dist/` to slop with a `slop.json` such as:

```json
{ "title": "jigcad", "kind": "page", "capabilities": { "sample": {} } }
```

slop injects its own `window.claude`, so `getSample()` works unchanged.

Things to verify before relying on it:

- relative asset paths for `worker.js`, `occt/*.wasm` and `jig_compute.wasm` resolve under `/v/<n>/`;
- the CSP allows wasm and `new Function`;
- sampling is admin-only and needs a consent prompt;
- 10 rounds means at most 9 eval steps per turn.

### Option B: a standalone `jigcad serve` (Go, `net/http.ServeMux`)

1. **Backend.** Reuse `slop-computer/pkg/piworker` and `pkg/piworker/gepp` (about 760 lines) with geppetto v0.13.13, started the way `serve.go:206-226` does it.
2. **HTTP layer.** Adapt about 150 lines from `rt_sample.go`, dropping views, consent and audit:
   - `POST /api/sample` (SSE)
   - `POST /api/sample/{call}/tools/{use}`
   - `POST /api/sample/{call}/cancel`
   - `GET /api/sample/models`
   - `GET /` serves the embedded `dist/`

   Bind to loopback or require a token: this server spends the operator's Pi credentials.
3. **Browser adapter.** Add `src/host/sample-http.js`, ported from `sample.ts`, with no npm dependencies:

   | Adapter input or event | What it does |
   |---|---|
   | `sample(turns, opts)` | POST to `/api/sample` |
   | `text` | call `opts.onText` |
   | `tool` | run `execute`, POST the result |
   | `result` | resolve `{ text, truncated }` |
   | `error` | throw `{ code }` |
   | abort | POST `/cancel` |

   Pass the adapter in as `<AgentPanel sample={…}/>`. That leaves claude.ai's own capability untouched.
4. **Claude.** Add an Anthropic API-key provider to `~/.pi/agent/models.json` and select it with `--model-default anthropic/<id>`.

## 7. Evidence status

**Checked directly:**

- `W/` HEAD is 18f97d4;
- `W/go.mod:88` pins geppetto v0.13.13;
- file sizes: `gepp/sample.go` 408 lines, `rt_sample.go` 261, `sample.ts` 218;
- the local checkout is 82 commits behind `origin/main`.

**From a read-only research pass over those files:** everything else.

**Untested inferences:**

- the Option A asset-path and CSP behaviour;
- the OAuth `x-api-key` problem.

## 8. Decision (2026-10-31)

The user chose: **serve from Go (Option B), with Pi as the provider and lunaroute models**: `lunaroute/glm-5.3-flash` and `lunaroute/deepseek-4.1-flash`.

- **The models exist.** Both ids are in `~/.pi/agent/models-store.json` under `lunaroute` (an `openai-completions` provider at `https://gw.lunaroute.com/v1`), and `auth.json` has a `lunaroute` OAuth login. `models.json` lists an older set (`deepseek-v4-flash`, `glm-5.2-*`). The catalog file carries the current ids.
- **Tier mapping:**

  | Tier | Model |
  |---|---|
  | quick | `lunaroute/glm-5.3-flash` |
  | default | `lunaroute/glm-5.3-flash` |
  | complex | `lunaroute/deepseek-4.1-flash` |

  All three can be overridden with `--model-quick`, `--model-default` and `--model-complex`. The jigcad agent panel's Model setting picks the tier.
- **The Claude caveat (§4) no longer blocks anything.** lunaroute goes through `openai-completions`, not the Anthropic OAuth path.
