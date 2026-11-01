---
Title: Implementation diary
Ticket: JIG-002-AGENT-LLM-BACKEND
Status: active
Topics:
    - agent
    - llm
DocType: diary
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://cmd/jigcad/main.go
      Note: serve command and flags
    - Path: repo://import/jigcad/src/agent/panel.jsx
      Note: getSample fallback to the backend
    - Path: repo://import/jigcad/src/host/sample-http.js
      Note: browser sample adapter
    - Path: repo://pkg/sample/gepp/sample.go
      Note: round loop, lastRoundNote
    - Path: repo://pkg/server/server.go
      Note: HTTP layer and call registry
    - Path: repo://ttmp/2026/10/31/JIG-002-AGENT-LLM-BACKEND--agent-model-backend-via-geppetto-and-the-pi-provider-slop-computer-pattern/scripts/cache-probe/main.go
      Note: prompt-cache probe
    - Path: repo://ttmp/2026/10/31/JIG-002-AGENT-LLM-BACKEND--agent-model-backend-via-geppetto-and-the-pi-provider-slop-computer-pattern/various/04-prompt-cache-measurements.md
      Note: raw cache measurements
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T20:57:40.428733785-04:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1: Design document for `jigcad serve`

The research note (reference/01) had already established how slop-computer reaches models: geppetto's
`providers/pi` reads Pi's agent directory, and a Go server streams one model call per page request while page tools
execute in the browser. This step turned that into a jigcad design: a Go server next to the workbench's static
files, the same `/api/sample` SSE protocol, and a browser adapter that gives the agent panel the `sample` function it
already expects from `window.claude`.

The document records four decisions: adapt slop's backend instead of importing its module (D1), execute tools in the
browser (D2), tier defaults from the user's model choice (D3), and 16 default / 32 maximum rounds (D4).

### Prompt Context

**User prompt (verbatim):** "write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault). Then continue witih phase 4b and 5 to close the rust ticket. For the LLM serving, we use pi and however use the lunaroute/glm-5.3-flash and deepseek-4.1-flash models. update the ticket, then do the rust stuff, then when the rust stuff is finished, write another report (with screenshots for both reports if possible), then continue with the go serving and all the agent functionality working through lunaroute. commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill) Then the go side is done, also write a report for the vault."

**Assistant interpretation:** After JIG-001 is closed and its report written, build the Go serving path of JIG-002 so the jigcad agent runs end to end through Pi and lunaroute on the two named models, with commits, this diary, and a final vault report.

**Inferred user intent:** Run the jigcad agent locally, outside claude.ai, on the operator's own Pi/lunaroute credentials, with a code path that can be maintained and explained.

**Commit (code):** 9fe56d3 — "JIG-002: record model decision (pi + lunaroute) and plan" (decision); the design doc is committed with this diary.

### What I did
- Read slop-computer (`W=/home/manuel/workspaces/2026-10-28/slop-computer/slop-computer`): `pkg/piworker/backend.go`, `validate.go`, `gepp/{backend,sample,gepp_test}.go`, `pkg/server/rt_sample.go`, `web/runtime/src/sample.ts`.
- Read jigcad's agent: `src/agent/panel.jsx` (`getSample`), `turn.js` (`runTurn`, `explainError`), `evaltool.js` (`createEvalTool`).
- Wrote `design-doc/01-jigcad-serve-go-model-backend-on-geppetto-and-pi-and-the-browser-sample-adapter.md`.

### Why
- The agent already speaks the `sample(turns, { tools, signal, modelTier, effort, onText })` contract. Keeping that contract means the panel, the eval tool and the tests stay unchanged; only the source of the function changes.

### What worked
- The contract maps one to one: slop's `web/runtime/src/sample.ts` implements the same option names the jigcad agent passes.

### What didn't work
- No failures in this step.

### What I learned
- slop's module requires Go 1.26.6 and pulls pgx, glazed and a sandbox runtime; importing it for ~700 lines of backend would drag all of that into jigcad (D1).

### What was tricky to build
- Deciding where tools run. The eval tool reads and edits the live workbench (files, compile, selection) and, in Ask mode, waits for the person, so it cannot run on the server. The server therefore holds each tool call on a channel and the page answers with a separate POST.

### What warrants a second pair of eyes
- The security posture: the server spends the operator's credentials. The design binds loopback and requires a token for anything else.

### What should be done in the future
- N/A for this step.

### Code review instructions
- Read the design doc §3 (API) and §4 (decisions) first.

### Technical details
- Endpoints: `GET /api/sample/models`, `POST /api/sample`, `POST /api/sample/{call}/tools/{use}`, `POST /api/sample/{call}/cancel`, `GET /*`.

## Step 2: Go module and `pkg/sample` adapted from slop's piworker

I created the Go module at the repository root (`github.com/go-go-golems/jig`, go 1.26.6, toolchain go1.26.10) and
copied slop's backend into `pkg/sample` (types, validation) and `pkg/sample/gepp` (geppetto backend, round loop,
tests), rewriting imports, package docs (with attribution), the lunaroute agent header and the round limits. The
scripted-provider tests came over unchanged apart from the header assertion and pass.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Build the backend layer first, validated against a stub provider.
**Inferred user intent:** A backend whose behaviour is tested before it touches real credentials.
**Commit (code):** 4c6ba07 — "JIG-002: jigcad serve — Go model backend on geppetto + Pi (lunaroute tiers) with the /api/sample SSE protocol"

### What I did
- `go.mod`: `module github.com/go-go-golems/jig`, `go 1.26.6`, `toolchain go1.26.10`; `GOTOOLCHAIN=auto go get github.com/go-go-golems/geppetto@v0.13.13 && go mod tidy`.
- A Python script copied `pkg/piworker/backend.go → pkg/sample/types.go`, `validate.go → pkg/sample/validate.go`, `gepp/{backend,sample,gepp_test}.go → pkg/sample/gepp/`, with these edits:
  - import path `…/slop-computer/pkg/piworker` → `…/jig/pkg/sample`; `piworker.` → `sample.`;
  - package comments rewritten with "Adapted from github.com/go-go-golems/slop-computer pkg/piworker (SLOP-010)";
  - `lunarouteHeaders`: `"lunaroute-agent": "jigcad"`;
  - rounds `min(max(MaxRounds,1),10)`, default 5 → `sample.MaxRounds` (32), `sample.DefaultRounds` (16);
  - the authentication message now says "restart jigcad serve".
- `go test ./pkg/sample/...` → `ok github.com/go-go-golems/jig/pkg/sample/gepp 0.077s`.

### Why
- Copying keeps jigcad's dependency set to geppetto, testify, errgroup, jsonschema and pkg/errors (D1).

### What worked
- All slop tests (text streaming, tools over rounds, last round without tools, failures, cancel during tool, model choice, budget, images) pass against the copy.

### What didn't work
- The first run of the conversion script aborted with an `AssertionError` on its first exact-match replacement (the package comment of `backend.go`). Cause: the script applied the generic `piworker.` → `sample.` rename before the exact replacements, so the comment text no longer matched. Nothing had been written. Fix: apply the exact replacements first, then the generic rename.
- `gepp_test.go` still asserted `"slop"` for the `lunaroute-agent` header; changed to `"jigcad"` with `sed`.
- gopls reported `undefined: sample.DefaultRounds` after I first put the constants in `gepp`; they moved to `pkg/sample/types.go` so the server can use them too.

### What I learned
- geppetto v0.13.13 needs Go ≥ 1.26.6; the local Go is 1.25.5, and `GOTOOLCHAIN=auto` runs the cached go1.26.10.

### What was tricky to build
- Keeping the copy recognisable: only the contract-level changes listed above were made, so a later diff against slop stays readable.

### What warrants a second pair of eyes
- The round constants: 16 rounds × the whole conversation resent each round is expensive (see Step 4: 194 K input tokens for one turn).

### What should be done in the future
- If slop moves the backend into geppetto or a shared module, replace this copy.

### Code review instructions
- `diff <(sed 's/piworker/sample/g' $W/pkg/piworker/gepp/sample.go) pkg/sample/gepp/sample.go`
- `GOTOOLCHAIN=auto go test ./pkg/sample/...`

### Technical details
- `sample.Backend`: `Models() []Model`, `Sample(ctx, Request, emit func(Event), ExecuteTool) error`, `Close() error`.

## Step 3: `pkg/server`, `cmd/jigcad serve`, first live calls

The server package implements the four `/api/` endpoints and static files on the standard library mux. It is slop's
`rt_sample.go` without views, grants, consent and audit; one log line per call replaces the audit. The command wires
flags, the Pi agent directory and the tiers, and refuses a non-loopback address without a token. The first live
calls, with no tools, answered "jigcad ok" on both tiers through lunaroute.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** The HTTP layer and the binary, then prove the lunaroute path with real calls.
**Inferred user intent:** A server that can be started with one command.
**Commit (code):** 4c6ba07 (same commit as Step 2)

### What I did
- `pkg/server/server.go`: `New(Config{Sample, Tiers, MaxRounds, Static, Token, Log})`; handlers `models`, `start`, `toolResult`, `cancel`; call registry (`add/remove/get/waitTool/takeTool`); `guard` (Bearer or `jigcad_token` cookie, constant-time compare); `tokenCookie` (`/?token=T` → cookie + 303 to the clean URL); `noCacheHTML`.
- `pkg/server/server_test.go` with a fake backend: `TestToolRoundTrip`, `TestCancelWhileToolWaits`, `TestRejectsBeforeStreaming`, `TestNoBackend`, `TestTokenAndStatic`.
- `import/jigcad/dist.go` (`var Dist fs.FS`) and `embed.go` (`//go:build embed`, `//go:embed all:dist`).
- `cmd/jigcad/main.go`: cobra `serve` with `--listen 127.0.0.1:8787 --dist --pi-agent-dir --model-quick/-default/-complex --max-rounds 16 --token (JIGCAD_TOKEN) --no-models`.
- Live: `curl -sN localhost:8787/api/sample -d '{"input":"Reply with exactly: jigcad ok","modelTier":"default"}'` and the same with `complex`.

### Why
- `net/http` with Go 1.22 patterns (`POST /api/sample/{call}/tools/{use}`) is enough; no framework.
- `usage` events stay in the server log, as in slop: the page has no use for token counts.

### What worked
- `go test ./pkg/...` → `ok …/pkg/sample/gepp 0.083s`, `ok …/pkg/server 0.013s`.
- Models endpoint: `lunaroute/glm-5.3-flash` tier quick, `lunaroute/deepseek-4.1-flash` tier complex, plus the rest of Pi's catalog.
- Live results: `{"text":"jigcad ok","modelTierApplied":"default","modelUsed":"lunaroute/glm-5.3-flash"}` (1122 ms) and `{"text":"jigcad ok","modelTierApplied":"complex","modelUsed":"lunaroute/deepseek-4.1-flash"}` (267 ms).

### What didn't work
- My first `start` duplicated validation (tool count, prompt bytes) that `sample.ValidateRequest` already does; removed, keeping one source of limits.

### What I learned
- Tools of one round run in parallel (`errgroup` in `runTools`), so the per-call tool counter must be atomic.

### What was tricky to build
- Ordering in the tool path: the channel must be registered (`waitTool`) before the `tool` event is sent, or a fast page could POST the result before anyone waits for it and get 404. `execute` registers first, then sends.
- `takeTool` deletes the entry, so a duplicate POST gets 404 and a late answer after a timeout cannot block on a channel nobody reads (the channel is buffered with capacity 1).

### What warrants a second pair of eyes
- `tokenCookie` only runs on static paths; `/api/` relies on `guard`. Static files are served without a token by design (they contain no secrets).
- The models endpoint lists every model in Pi's catalog, including providers the operator has logged in to for other purposes.

### What should be done in the future
- Optionally restrict the models list to the configured tiers.

### Code review instructions
- `pkg/server/server.go` `start` and `execute`; `GOTOOLCHAIN=auto go test ./pkg/server/`.
- `go run ./cmd/jigcad serve --listen 0.0.0.0:8789` must fail with the token message.

### Technical details
- SSE frame: `event: <type>\ndata: <json>\n\n`; types `call`, `text`, `thinking`, `tool`, `result`, `error`.
- Log line: `sample <id> tier=… model=… asked=… tools=N in=… out=… ms=… outcome=ok|cancelled|<code>`.

## Step 4: Browser adapter, live agent turns, and the empty last round

`src/host/sample-http.js` ports slop's runtime `sample()` onto `/api/sample`, minus consent, images and caching.
`getSample()` in the panel now tries `window.claude` first and otherwise probes `GET api/sample/models`; when the
backend answers, the panel shows the tier's model next to the Model control. Then I ran real turns in the browser:
glm-5.3-flash made the walls 0.4 mm thicker in 9 eval steps with a correct mass and face table; deepseek-4.1-flash
first failed with an empty completion after 15 exploration steps, which led to a backend fix, and then answered
correctly in 12 steps.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Make the existing agent panel work through the Go backend and verify it with real turns on both models.
**Inferred user intent:** The full agent feature set (auto, ask, stop, edits, checks) working on lunaroute.
**Commit (code):** a7cb8e2 — "JIG-002: browser sample adapter for jigcad serve; last-round answer note"

### What I did
- `src/host/sample-http.js`: `createHttpSample(base, fetch)`, `httpSample(base, fetch)` (probe; returns the function with `.info`), `sseEvents(body)`.
- `src/agent/panel.jsx`: `getSample()` fallback; `tierModel` label (`.agent-model`).
- `src/agent/turn.js`: `OFF_CODES.unauthorized`, `NOTES.authentication_error`, `NOTES.empty_completion`.
- `test/agent/sample-http.test.mjs`: tool round trip, throwing tool, error codes, abort → cancel POST, probe.
- `node build.mjs` (with `ESBUILD=$SCRATCH/esb/node_modules/esbuild/lib/main.js`), restarted `jigcad serve`, drove the Agent view with Playwright.
- `pkg/sample/gepp/sample.go`: `lastRoundNote`, appended as a user turn before the last round of a call that used tools; `TestLastRoundOffersNoTools` checks it is the last message of the final request.

### Why
- The note: once tools disappear, a model that has only been calling tools has no instruction to stop exploring. Telling it explicitly is cheaper than raising the round limit.

### What worked
- `node --test test/agent/*.test.mjs` → `tests 34, pass 34, fail 0`.
- Balanced (glm-5.3-flash), "Make the walls 0.4 mm thicker and check the mass and every face that depends on them": server log `tools=9 in=194168 out=2397 ms=24149 outcome=ok`; script now has `wall: mm(2.4)`; answer reports mass 19.027 g → 22.505 g and a before/after table of the five inner faces. Screenshot `various/01-agent-turn-glm-5.3-flash.png`.
- Deep (deepseek-4.1-flash), after the fix, "Add a 3 mm fillet to the four vertical outside edges…": `tools=12 in=277239 out=3629 ms=25682 outcome=ok`. It found that the outline already has `r: 'r'` with `r = mm(3)`, tried the fillet with `check()` (fails with `fillet.tooLarge`), left the file unchanged and explained how to move the radius into a fillet feature. Screenshot `various/02-agent-turn-deepseek-4.1-flash.png`.
- Ask mode + Stop (Fast): the step waited for "Run this step" (screenshot `various/03-ask-mode-tool-waiting.png`); after one approval, Stop on the second ask → UI "Stopped.", server `tools=2 … ms=73428 outcome=cancelled`.
- `go build -tags embed` → 41.6 MB binary (30.9 MB without); `serve --no-models` served `/` (200) and `jig_compute.wasm` as `application/wasm`; `/api/sample/models` → `"available":false`.

### What didn't work
- Deep tier, first attempt: server log `tools=15 in=342607 out=6075 ms=44946 outcome=empty_completion`; the panel showed "The model returned an empty answer." The 15 steps were exploration (`faces('%cylinder')`, `faces('|Z')`, `program.ir('L4')`, several `const cur = \`…\`` drafts) and the 16th, tool-less round returned no visible text. Fixed with `lastRoundNote` (above).
- `node --test test/agent/` (directory argument) failed under Node 24 with `MODULE_NOT_FOUND`; the glob form `test/agent/*.test.mjs` works.
- Playwright `browser_type` with a `textbox "…"` target failed: `Unexpected token "" while parsing css selector`; used the snapshot ref instead.
- `pkill -f "jigcad-embed serve"` inside a compound command killed its own shell (exit 144) because the pattern matched the command line; reran the remaining check separately.
- Console errors during the glm turn (`faces: selector: unknown token 'shell/*'`) are the model's own failing eval code being reported back to it, not adapter errors.

### What I learned
- Flash models are workable for this agent but explore a lot: 9–15 eval calls per turn, and each round resends the conversation including the ~14 KB reference (194 K–343 K input tokens per turn).
- Ask mode exercises the 150 s server wait directly; the call stays open while the person decides.

### What was tricky to build
- The adapter's `tool` handling is fire-and-forget (`runTool` is not awaited inside the SSE loop), as in slop: the stream must keep reading while a tool runs, because the server may emit `text` and, in principle, parallel tool calls.
- Abort ordering: the adapter posts `/cancel` only once it knows the call id; aborting before the `call` event just aborts the fetch, and the server's request context cancels the call.

### What warrants a second pair of eyes
- `lastRoundNote` changes the conversation the model sees in its final round; it is a jigcad addition to slop's loop and is marked as such.
- `getSample()` probes the backend only on http(s) pages; a claude.ai page with `window.claude` never probes.

### What should be done in the future
- Measure the round budget per model over several prompts; consider telling the model its remaining rounds in each tool result.
- Prompt caching is unavailable on this path; trimming the reference for later rounds would cut input tokens.

### Code review instructions
- `import/jigcad/src/host/sample-http.js`, `src/agent/panel.jsx` `getSample`, `pkg/sample/gepp/sample.go` `run`.
- `node --test import/jigcad/test/agent/*.test.mjs`; `GOTOOLCHAIN=auto go test ./pkg/...`.
- Live: `cd import/jigcad && node build.mjs && cd ../.. && go run ./cmd/jigcad serve`, open `http://127.0.0.1:8787/`, Agent tab.

### Technical details
- Result mapping: `modelApplied` in the page result is the server's `modelUsed` (the model that actually ran).
- `lastRoundNote`: "No tool calls are left in this turn. Answer now in plain text from what you have found so far. Say plainly what is done, what you checked, and what is unfinished."

## Step 5: Vault report

I wrote the third jigcad report for the go-go-parc vault in the textbook style used for the first two, with the three
browser screenshots, and pushed it. The report explains the sample contract, why tools run in the page, the Pi and
lunaroute model path, the round loop, the empty-last-round failure and its fix, the adapter, access control and the
measurements.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** "Then the go side is done, also write a report for the vault."
**Inferred user intent:** A durable explanation of the Go serving work next to the two Rust reports.
**Commit (code):** go-go-parc 084bf51 — "jigcad report 3: a Go model backend for the workbench agent (JIG-002)"

### What I did
- Copied `various/0{1,2,3}-*.png` to `go-go-parc/Projects/2026/10/31/_assets/jigcad-agent-*.png`.
- Wrote `Projects/2026/10/31/PROJECT REPORT - jigcad - A Go Model Backend for the Workbench Agent.md`; staged only that note and the three images (the unrelated dropcut-studio changes stay untouched); `git push`.

### Why
- Same folder and naming as the two JIG-001 reports so the three link to each other.

### What worked
- `git status -sb` → `## main...origin/main` after the push.

### What didn't work
- My first draft claimed "about 20 K tokens for round 1" and compared the flash models with larger ones; neither was measured. Replaced with the measured average (194 K over ten requests ≈ 19 K each) and an observation from these runs only.

### What I learned
- N/A.

### What was tricky to build
- Keeping the report's numbers traceable: every token, time and outcome figure is copied from the server's per-call log lines quoted in Step 4.

### What warrants a second pair of eyes
- Section 6 states that the repeated Deep run is not a controlled comparison; the fix is justified by the guarantee it gives, not by one run.

### What should be done in the future
- N/A.

### Code review instructions
- Read the report's §3 (tool path) and §6 (last round) against `pkg/server/server.go` `start` and `pkg/sample/gepp/sample.go` `run`.

### Technical details
- Assets: `jigcad-agent-balanced-glm-turn.png`, `jigcad-agent-deep-deepseek-turn.png`, `jigcad-agent-ask-mode-waiting.png`.

## Step 6: Measuring prompt caching through lunaroute

Asked whether the reference is resent "multiple copies each round", I had to correct two claims of mine. The
reference appears once per request (in the first user message), and I had written in Step 4, the design doc and
both vault reports that this path has "no prompt caching" without measuring it. This step measured it. lunaroute
caches prompt prefixes automatically for both models, and the earlier token totals overstate the uncached work by
roughly a factor of eight.

### Prompt Context

**User prompt (verbatim):** "do you mean the reference is attached again (multiple copies) each round? because wouldn't prefix caching otherwise make things reasonably cheap?" — followed by "ok, well, continue"

**Assistant interpretation:** Verify whether provider-side prefix caching applies to the agent's rounds, then correct the docs and reports accordingly.

**Inferred user intent:** Avoid optimising (trimming the reference) for a cost that may not exist; get the facts right in the written record.

**Commit (code):** see the commit that adds this step — "JIG-002: log prompt-cache tokens; cache-probe and usage-proxy; measurements"

### What I did
- `pkg/server/server.go`: the per-call log line now has `cacheRead=` and `cacheWrite=` (summed from `usage` events).
- `scripts/usage-proxy/main.go`: a reverse proxy to `https://gw.lunaroute.com` that logs only the `usage` object and model of each streamed chunk (no headers, prompts or credentials).
- A scratch copy of `~/.pi/agent` (symlinks, plus `models.json`/`models-store.json` with the lunaroute base URL rewritten to the proxy); deleted afterwards.
- `scripts/cache-probe/main.go`: drives `gepp.Backend.Sample` with the agent reference as the prefix and a prompt forcing four eval rounds; prints each round's usage. Needs `pi.WithLocalProviders()` for the plain-HTTP loopback proxy.
- Real turns through `jigcad serve` (fresh process, real Pi directory) on A-01: Balanced, then a Deep follow-up in the same thread.
- Raw evidence: `various/04-prompt-cache-measurements.md`.

### Why
- Measuring first decides whether "send the reference only in round 1" is worth building.

### What worked
- Probe, glm-5.3-flash: round 1 `input 4302 cacheRead 0`; rounds 2–5 `cacheRead 4096, 4096, 4352, 4352` of 4333–4393.
- Probe, deepseek-4.1-flash: round 1 `input 4639 cacheRead 0`; rounds 2–5 `cacheRead 4608, 4864, 4864, 4864` of 4832–5002. Raw usage shows `prompt_tokens_details.cached_tokens` and, for DeepSeek, `created_cache_tokens: 4608` on round 1.
- Same process, second call with the same prefix: round 1 `cacheRead 4096` (glm) and `4608` (deepseek) — warm.
- New process: round 1 cold again (`cacheRead 0`) one minute later.
- Real turn, Balanced: `tools=8 in=170359 cacheRead=149248 cacheWrite=0 out=1650 ms=16668 outcome=ok` (88 % cached).
- Real follow-up, Deep: `tools=1 in=39988 cacheRead=20224 out=512 ms=3478 outcome=ok` (round 1 cold for this model in this session, round 2 warm).

### What didn't work
- `jigcad serve --pi-agent-dir <proxied copy>` failed every call in 1 ms with `upstream_error`: geppetto's Pi provider refuses plain-HTTP and loopback base URLs unless `pi.WithLocalProviders()` is passed (`agentdir.go:117`). I did not add a server flag for a one-off measurement; the probe program enables it instead.
- `pkill -f "scratchpad/jigcad serve"` killed its own shell again (exit 144) and the probe file was never written; rewrote it with the editor and stopped processes by PID from `ps`.
- `gofmt -l` flagged `pkg/sample/gepp/sample.go` (an extra blank line from Step 4) and `pkg/server/server.go` (comment alignment); fixed with `gofmt -w`.

### What I learned
- The research note's "Prompt caching: not implemented" referred to Anthropic's explicit `cache_control`. OpenAI-compatible providers such as lunaroute cache prefixes automatically, with no request flag; I carried the Anthropic statement over to this path without checking.
- The cache is session-affine: the per-process `x-lunaroute-session` id makes calls of one server process share a warm cache; a restart starts cold.
- Cache hits arrive in blocks (4096, 4352, 4608, 4864 tokens): the tail of each request since the last block boundary is uncached.

### What was tricky to build
- Observing the provider's raw usage without logging secrets: the proxy logs only the parsed `usage` object of `data:` lines; the scratch agent directory symlinks `auth.json` instead of copying it.

### What warrants a second pair of eyes
- `cacheWrite` is always 0 in the server log, because geppetto does not map DeepSeek's `created_cache_tokens`. A geppetto change would be needed to report it.

### What should be done in the future
- Drop "send the reference only in round 1" from the plan; the remaining cost per round is the uncached tail plus output.
- Keep the lunaroute session id stable for the server's lifetime (as now); consider persisting it across restarts only if cold first rounds matter.

### Code review instructions
- `pkg/server/server.go` log line; `scripts/cache-probe/main.go`; `scripts/usage-proxy/main.go`.
- Re-run: start `go run ./ttmp/…/scripts/usage-proxy`, point a copy of `~/.pi/agent` at `http://127.0.0.1:9911/v1`, then `go run ./ttmp/…/scripts/cache-probe --pi-agent-dir <copy>`.

### Technical details
- lunaroute usage chunk (glm, round 2): `{"completion_tokens":13,"prompt_tokens":4333,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":1,…}`.
- Pi lists lunaroute's cost for both models as 0, so caching affects latency and provider load rather than money here.
