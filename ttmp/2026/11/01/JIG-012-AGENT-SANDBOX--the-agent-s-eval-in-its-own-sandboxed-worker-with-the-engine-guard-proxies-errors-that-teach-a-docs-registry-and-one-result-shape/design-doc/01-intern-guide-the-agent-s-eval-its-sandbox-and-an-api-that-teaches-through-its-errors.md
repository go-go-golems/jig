---
Title: 'Intern guide: the agent''s eval, its sandbox, and an API that teaches through its errors'
Ticket: JIG-012-AGENT-SANDBOX
Status: active
Topics:
    - agent
    - api
    - sandbox
    - docs
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: import/jigcad/src/agent/evaltool.js
      Note: the eval tool and today's in-page runner
    - Path: import/jigcad/src/agent/scope.js
      Note: the lab scope, the bridged side after JIG-012
    - Path: import/jigcad/src/engine/worker.js
      Note: engine ops; module-level engine state
    - Path: import/jigcad/src/engine/j.js
      Note: the j namespace where guards go
    - Path: import/jigcad/src/host/engine.js
      Note: promise RPC to the engine worker
ExternalSources: []
Summary: "How the jigcad agent evaluates code today (page-side eval, engine in a worker, lab scope, harness), what 517 recorded runs and one long transcript say goes wrong, what factory-videos and Kiln learned, and the JIG-012 design: a sandboxed worker with its own engine and a port to the page, guard proxies, argument checks, a hint table, self-describing values, one docs registry with help(), and one result shape; with the protocol, API changes, plan, tests and risks."
LastUpdated: 2026-11-01T17:23:01.051273063-05:00
WhatFor: ""
WhenToUse: ""
---

# Intern guide: the agent's eval, its sandbox, and an API that teaches through its errors

This guide is for someone joining the jig project who will work on the workbench agent. It explains, from the
ground up, how the agent inside jigcad does its work today, what measurements say goes wrong, and the design that
ticket JIG-012 implements: the agent's code runs in its own sandboxed worker with its own copy of the CAD engine,
the API answers a wrong guess with the right names, errors carry their fix, the documentation is generated from one
registry, and results have one shape. The guide ends with an implementation plan, the tests and the measurements.

Read sections 1–3 to understand the system, section 4 for the evidence, sections 5–10 for the design and
section 11 onward for the work itself.

## 1. The system in one page

jig is a JavaScript language for parametric CAD whose output is meant to be 3D printed. A *script* is the body of a
JavaScript function that receives a namespace object `j` and unit functions (`mm`, `deg`, `lw`, `layer`, …) and
returns a *model*: a part, a sketch, an assembly, a print job or a design. The engine compiles the model into a
*Program*: solids built with OpenCascade (a C++ B-rep kernel compiled to WebAssembly), metrics such as volume and
mass, diagnostics, persistent face names and seven levels of intermediate representation.

jigcad is the browser workbench around the language. It has views for the code, a drafting-sheet rendering of the
solids (the *stage*), the feature graph, the parameters, the diagnostics, the IR and the exports. It also has an
*agent*: a language model that the person can ask to change or explain the design.

```text
 ┌──────────────────────────── the page (main thread) ─────────────────────────────┐
 │  UI (Preact)        Host (src/host/host.js)            Agent panel (src/agent/) │
 │  code, stage,  ◀──▶ files, overrides, program,  ◀────▶ turn.js, evaltool.js,   │
 │  params, …          selection, view, compile()          scope.js, prompt.js     │
 │                          │ request(op, args)                 │ sample(turns,…)  │
 └──────────────────────────┼───────────────────────────────────┼──────────────────┘
                            ▼                                   ▼
              engine Web Worker (dist/worker.js)        model backend
              src/engine/worker.js: init, compile,      jigcad serve (Go): POST api/sample,
              call, export, run · OpenCascade wasm,     SSE events; or claude.ai's runtime
              jig-compute wasm (Rust)                    (window.claude.use('sample'))
```

Three facts about this picture matter for everything that follows:

- **The engine lives in a Web Worker.** `j`, the unit functions and OpenCascade exist only there. The page talks to
  it through `host.engine.request(op, args)`, a promise RPC over `postMessage` (`src/host/engine.js`).
- **The agent's code runs on the page.** Its one tool, `eval`, compiles the model's code with `new Function` in the
  main thread, with a *lab scope* of functions in reach (`src/agent/evaltool.js`, `src/agent/scope.js`). That code
  can therefore read `localStorage`, touch the DOM and make network requests, and it cannot use `j`.
- **The tool loop runs on the page too.** `sample(turns, { tools })` (the capability contract shared with
  claude.ai's runtime) streams the model's answer; when the model asks for a tool, the page executes it and sends
  the result back (`src/host/sample-http.js` for `jigcad serve`).

## 2. One agent turn, step by step

A *turn* starts when the person sends a message in the agent panel and ends when the model gives its answer.

1. `runTurn` (`src/agent/turn.js`) appends the person's message to the thread and an empty agent turn
   `{ role: 'agent', text: '', steps: [], blocks: [], pending: true }`.
2. It builds the messages for the model with `toTurns` (`src/agent/prompt.js`): the instructions and the reference
   on the first user message, a `[context]` block of live state on the last one (preset, open file, compile status,
   diagnostics, selection, key metrics), and earlier steps compressed to one line each.
3. It creates the tool with `createEvalTool(host, …)` and calls `sample(turns, { tools: [tool], onText,
   onThinking, … })`.
4. The model streams reasoning (`onThinking`) and text (`onText`); both become *blocks* of the turn, placed before the
   step they led to (`addBlock` in `turn.js`).
5. When the model calls `eval({ code })`, the tool:
   - creates a *step* record and, in Ask mode, waits for the person to approve it;
   - snapshots the files (`takeSnapshot`), so the person can revert the step;
   - runs the code (`runEval`): it builds the lab scope, wraps every function so promises it returns are tracked,
     compiles the code as an async function body, races it against a 25 s timeout, and formats the returned value as
     YAML (`src/agent/yaml.js`), with `console.log` output first and notes for promises the code never awaited;
   - returns the text (and any images from `look()`) to `sample`, which sends it to the model.
6. The loop repeats until the model answers without a tool call, or a limit is reached (16 rounds on `jigcad serve`).

```text
 person ──message──▶ runTurn ──turns──▶ sample ──HTTP/SSE──▶ jigcad serve ──▶ model
                        ▲                 │ tool event {use, name:'eval', input:{code}}
                        │                 ▼
                        │          tool.execute(code) ── snapshot ── runEval(host, code)
                        │                 │                              │ labScope(host): files, run, check,
                        │                 │                              │ program, faces, look, …  (page)
                        │                 ◀───────── YAML text, images ──┘
                        └─ blocks, steps, answer (panel renders them in order)
```

### 2.1 The lab scope today

`labScope(host, { readOnly, console, images })` in `src/agent/scope.js` returns an object whose keys become the
names the agent's code sees. Every function returns small plain data and throws an `Error` whose message says how to
fix the call. The groups:

| Group | Names | Implemented by |
|---|---|---|
| files | `files.list/read/grep/write/edit/rename/remove` | `makeFiles(host)`: the host's file map |
| compile | `run()`, `check(variant, options)` | `host.compile()`, `host.check(files, options)` (engine `compile` op) |
| the program | `program.summary/metrics/diagnostics/params/trace/decisions/graph/ir/bodies/print` | `makeProgram(host)`: reads `host.program` (the last compile's ProgramData) |
| queries | `why`, `faces`, `feature`, `sketch` | `host.call(method, …)`: engine `call` op on the worker's current Program |
| measure | `measure.face/edge/bbox/area/distance/angle` | computed on the page from ProgramData bodies |
| the bench | `selection`, `select`, `view.get/set`, `look` | host state; `look` draws the stage to a JPEG (`host.renderView`) |
| params, presets, exports | `params.*`, `presets.*`, `exportFile` | host methods |
| links | `lab.open/face/node/param/…/follow` | `lab:` link targets for the answer |

Read-only mode replaces the functions that change anything with ones that throw `read-only mode: X is off`. The
reference the model reads (`src/agent/reference.md`, section "The agent's eval scope") describes each name in a
table; `host.reference()` appends it to the instructions.

### 2.2 What the engine worker offers

`src/engine/worker.js` answers messages `{ id, op, … }` with `{ id, ok, … }`:

| op | Does | Notes |
|---|---|---|
| `init` | loads OpenCascade and jig-compute | accepts `wasmBinary` / `computeBinary` bytes instead of fetching |
| `compile` | runs `script.js` with `j`, units and `data` in scope, compiles the model | keeps the result as the worker's *current* Program unless `keep: false` |
| `call` | asks the current Program (`why`, `faces`, `feature`, `sketch`, …) | the page's queries go here |
| `export` | STL, 3MF, STEP, SVG, IR bundle | |
| `run` | runs arbitrary code with `j`, units, `data`, `files` and `compile(text)` in scope | used by the Experiments view (`host.run`) |

`runScript` evaluates code with `//# sourceURL=script.js`, so a stack frame names the line in the person's file;
`callsite.js` uses the same trick to stamp every builder call with its line. The worker keeps module-level state
(`J`, `current`), so one module instance is one engine with one current Program.

## 3. The evaluation harness

`tools/agent-eval.mjs` runs scripted *cases* against real models, in Node, with the real engine
(`tools/agent-eval/node-engine.mjs` calls `worker.js`'s `handle()` in-process). A case
(`test/agent-eval/cases/*.json`) names a preset, a request, optional follow-ups, and *checks* on the final files and
program: `compiles`, `metric` (a number or band), `file` (contains or matches), `answer` (regexes on the answer in
plain text), `steps` (a step's code matches). Each run writes one record per case and tier to `results.jsonl`, with
every step's code and result. `--look chrome` renders `look()` images in headless Chrome.

The records are the evidence base of this ticket: eleven `results.jsonl` files from JIG-003 to JIG-009.

## 4. What goes wrong, measured

### 4.1 Misuse errors in 517 recorded runs

A scan of all eleven `results.jsonl` files (2,697 eval steps) for errors that come from using the API wrongly:

| Error in a step result | Count | Meaning |
|---|---:|---|
| `ReferenceError: j is not defined` | 73 | the model wanted the language in an eval step |
| `ReferenceError: mm is not defined` | 39 | the same, for units |
| `… is not a function` from an unawaited promise | 83 | the JIG-004 note now explains these |
| `Cannot read properties of undefined (reading 'volume')` | 15 | a failed `check()` has no `metrics`, or the wrong shape was assumed |
| `b.faces.map / .filter / .slice is not a function` | 9 | `program.bodies()` returns `faces` as a count |
| `r.warnings.map is not a function` | 3 | warnings were a count before JIG-009 |

182 of the 517 runs (35 %) hit at least one of these. The largest group, 112 errors, is the model reaching for `j`
where `j` does not exist.

### 4.2 One long session, read step by step

The Cat magnet pin transcript (JIG-011, `sources/01-cat-magnet-pin-transcript.md`) adds what counts cannot show:

- Seven of fourteen steps probed the API: whether expression coordinates work in regions, how to size a press-fit
  pocket from a param, whether `j.lib.magnet` fits. Without `j` in reach, every probe was a whole part pasted into a
  string and compiled with `check()`.
- `check()` cannot return a value computed inside the script. The agent encoded answers in the bounding box width
  or in a thrown error's message.
- `j.fit.hole('md', 'press')` inside `.params()` fails with `mm(…) takes a number, got NaN`: neither the call nor the
  cause is named.
- `j.lib.magnet` cuts its pocket upward from its placement point while `j.lib.dowel` cuts down into the surface.
- `program.bodies()`, `check().summary` and `program.summary()` disagree on field names and shapes.

### 4.3 What two other workbenches learned

Two earlier projects by the same author solved parts of this problem, and one of them measured it.

**factory-videos** (`~/code/factory-videos` on bling; tickets FACTORY-AGENTERR-001/002, FACTORY-JSDRILL-001,
FACTORY-REPORTFIX-002, `docs/agent-evaluation-playbook.md`):

- *Models learn from error messages, not documentation.* In 230 evals the agent read the docs 4 times and followed
  1 of 8 errors that named a docs topic, yet it fixed nearly every failed eval on the next one from the message
  alone. Fixes therefore go into messages and into functions that cannot be misread; documentation comes last.
- *Make silent failures loud first.* A rule that fails loudly with a good message need not be in the prompt; only
  rules that stay silent must be.
- *Guard namespaces, not values.* A `Proxy` whose `get` trap throws for an unknown key turns `ui.kpii()` into
  "ui.kpii does not exist; did you mean ui.kpi?". Their spike showed that `x.maybe?.()` throws through such a proxy
  (optional chaining reads the property first), so values and builder handles stay unguarded; a hint table rewrites
  engine errors on those instead.
- *Docs as topics generated from the code's registry*, with the prompt holding signatures, one line each, a topic
  index and "read X before Y" triggers, under a size budget enforced by a test.
- *A model-free message lint*: every declared function called with the junk models send; an answer in the
  implementation's words fails the test.
- *Type-checking eval code with tsc* flagged 141 evals that worked and 42 that failed: too noisy to block on.

**Kiln** (`~/Downloads/kiln-aispe-full.zip`, `apps/workbench/src/agent/`):

- The eval runs in a fresh `<iframe sandbox="allow-scripts">` built from `srcdoc`, whose Content-Security-Policy
  refuses every connection; its only script starts a Web Worker from a `blob:` URL and hands it a `MessagePort`.
  The worker has its own copy of the language, so live objects and predicates work; every workbench call is a
  message the page checks against an allowlist and the run mode.
- Values that cross the port are encoded: data passes, a tensor is tagged and rebuilt, any other object with a
  prototype becomes its summary.
- Errors list the valid choices (`no IR level "x"; levels: input, torch, …`).

## 5. The design in one page

JIG-012 makes five changes, in this order, each measured before the next:

1. **Measure first.** A failure report over the recorded runs and a model-free message lint give a baseline.
2. **The sandbox.** The agent's code runs in a sandboxed worker with its own engine: `j`, units and `data` are native,
   `check()` returns a live program, workbench calls cross one port to the page, and the page checks each call
   against an allowlist and the run mode.
3. **Errors that teach.** Guard proxies on every namespace (in scripts and in the agent's scope), argument checks
   that name the call, a hint table for engine errors, self-describing values, and the library fixes.
4. **One documentation registry.** The reference's scope table and `help()` come from the same records.
5. **One result shape.** `run()`, `check()` and `program.summary()` agree; metrics are plain numbers by default.

```text
 ┌──────────── page ─────────────┐   MessagePort per eval    ┌──── sandbox worker (blob:, opaque origin) ───┐
 │ evaltool.execute(code)        │ ── {t:'eval', code, api, ─▶│ runner: scope = local ∪ bridged stubs         │
 │  snapshot, Ask approval       │     ctx}                   │  local: j, mm…, data, check(), help(), log    │
 │ serve(path,args):             │ ◀─ {t:'call', id, path, ── │  bridged: files.*, run, program.*, faces, …   │
 │  allowlist + read-only        │     args}                  │  guards, tracked promises, hints, YAML        │
 │  labScope(host)[path](…args)  │ ── {t:'ret', id, value, ─▶ │                                              │
 │  look() images stay here      │     ctx?}                  │ own engine: OpenCascade + jig-compute,        │
 │ timeout → restart the worker  │ ◀─ {t:'done', ok, text} ── │ loaded once from bytes the page sent          │
 └───────────────────────────────┘                            └──────────────────────────────────────────────┘
```

## 6. The sandbox

### 6.1 Why a separate worker with its own engine

Three alternatives were considered.

| Option | Ergonomics | Isolation | Cost |
|---|---|---|---|
| Keep eval on the page; add `jig(code)` that sends a string to the engine worker | code in strings again | none | small |
| Run eval inside the existing engine worker | `j` native | agent code can corrupt the person's engine state | medium |
| **A dedicated sandbox worker with its own engine** | `j` native, live programs | the person's engine and page are out of reach | a second engine instance |

The third gives the model the language directly, isolates the page, and keeps the person's engine state (the current
Program that the stage, exports and queries use) untouched by experiments. Its cost is memory for a second
OpenCascade instance and about a second of start-up, paid once per page session and hidden by starting the sandbox
when the agent panel opens.

### 6.2 Isolation in the browser

The page creates a hidden `<iframe sandbox="allow-scripts">` from `srcdoc`. Without `allow-same-origin` the frame's
origin is opaque: it has no cookies, no `localStorage`, no access to the parent's DOM, and the server sees
`Origin: null`. The `srcdoc` document carries a policy:

```text
default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:
```

- `'unsafe-inline'` lets the frame's one bootstrap script run;
- `'unsafe-eval'` lets the worker compile the agent's code (`new Function`) and instantiate WebAssembly;
- `worker-src blob:` allows the worker; `default-src 'none'` refuses `fetch`, `WebSocket`, `importScripts` and images.

The bootstrap script waits for one message carrying a `MessagePort` and the worker's source text, starts
`new Worker(URL.createObjectURL(new Blob([source])))`, and transfers the port to it. The worker inherits the policy
and has no document. From then on the page and the worker speak only through the port.

The worker source is `dist/agent-worker.js`, a separate esbuild bundle of `src/agent/sandbox/worker-main.js`. The
page fetches it as text once (the frame itself cannot fetch) and passes the text in. It contains the whole engine,
so it is about the size of `dist/worker.js`.

### 6.3 Loading the engine without the network

OpenCascade and jig-compute normally fetch their `.wasm` files. Inside the sandbox nothing can be fetched, so the page
fetches the bytes once (`./occt/replicad_single.gz.wasm`, decompressed with `DecompressionStream('gzip')`, and
`./jig_compute.wasm`), keeps them, and sends copies in the worker's `init` message. `loadOC({ wasmBinary })` and
`loadCompute({ computeBinary })` already accept bytes (`src/engine/oc.js`, `src/engine/rs/wasm.js`). If
jig-compute is missing, the engine runs its JS implementations, as it does today.

### 6.4 The protocol

The worker is long-lived; each eval gets its own `MessageChannel`, so a late message from a finished eval can never be
mistaken for one of the next.

| Direction | Message | Meaning |
|---|---|---|
| page → worker (worker port) | `{ t: 'init', occt, compute }` | load the engine; answered `{ t: 'ready', ms, compute }` |
| page → worker (worker port) | `{ t: 'eval', port }` (port transferred) | serve one eval on `port` |
| page → eval port | `{ t: 'start', code, api, ctx, readOnly }` | run `code`; `api` lists the bridged paths; `ctx` is the page state the local engine compiles with |
| eval port → page | `{ t: 'call', id, path, args }` | a bridged call |
| page → eval port | `{ t: 'ret', id, ok, value, error, ctx? }` | its result; `ctx` when the call changed files or overrides |
| eval port → page | `{ t: 'done', ok, text, ms }` | the step's result text (YAML, logs, notes, hints) |

`ctx` is `{ files, overrides, entry }`: the files as a plain object and the overrides as the engine takes them
(quantity text such as `'80 mm'`). The page sends a new `ctx` after any call in the *changes* set (`files.write`,
`files.edit`, `files.rename`, `files.remove`, `params.set`, `params.clear`, `run`, `presets.load`,
`presets.create`), so the worker's `check()` always compiles what the page holds.

### 6.5 What runs where

| In the sandbox (local) | On the page (bridged) |
|---|---|
| `j`, `mm`, `cm`, `deg`, `lw`, `layer`, … (the same names as scripts) | `files.*` |
| `data` (the preset's data files, parsed as the compiler does) | `run()` (the person's compile, the stage updates) |
| `check(variant?, options?)` → result with a live `program` | `program.*`, `why`, `faces`, `feature`, `sketch` |
| `help(x)` | `measure.*`, `selection`, `select`, `view.*`, `look` |
| `log`, `console` | `params.*`, `presets.*`, `exportFile`, `lab.*` |

Bridged calls keep their current behaviour and semantics: they act on the person's workbench and its last compile.
Local calls never touch the workbench. `check()` with no argument compiles the current files and overrides in the
sandbox's engine, which is how the model gets a live program of the current state:

```js
const r = await check();                       // the current files, compiled in the sandbox
const big = await r.program.faces('%plane');   // live: selector text …
const thin = r.program.bodies().filter(b => b.faceCount > 20);
const d = j.fit.hole(mm(6), 'press');          // the language, directly
return { ok: r.ok, pocket: d, faces: big.length };
```

### 6.6 Values across the port

The structured-clone algorithm carries numbers, strings, plain objects, arrays, Maps, Sets and typed arrays. Bridged
results are already plain data. A bridged call's *arguments* must be data too: a function argument is refused with
`files.write: functions cannot be sent to the page; pass data`. Local values never cross the port except through the
final YAML.

### 6.7 Timeouts, restarts and leftovers

The page races each eval against 25 s. On timeout it terminates the worker (a loop that never yields cannot be
interrupted any other way), answers `eval timed out after 25 s; the sandbox restarted, so values kept on globalThis
are gone`, and starts a new worker lazily on the next eval. A Stop from the person does the same.

The worker outlives evals, so a value an eval assigns to `globalThis` would survive into the next one. The runner
records `globalThis`'s own keys before an eval and deletes new ones after it, so evals do not leak into each other. The
reference states that each step starts clean, which matches what `const` and `let` already do.

### 6.8 Node: the same sandbox for the harness and tests

`tools/agent-eval` runs turns in Node, so the sandbox has a Node client with the same interface:
`src/agent/sandbox/node.js` starts a `worker_threads` Worker on `src/agent/sandbox/node-worker.mjs`, which registers
the module hooks the harness needs and then runs the same runner. Node offers no CSP; isolation there is not a goal,
fidelity is. The module-level engine state is per worker, so the harness's engine and the sandbox's engine stay
separate exactly as in the browser.

### 6.9 Without a sandbox

The mock engine (`#mock`), a page that cannot start workers, or a failed sandbox start fall back to today's in-page
eval. There, `j` and `mm` are guards whose message says the language is unavailable in this session and why.

## 7. Errors that teach

### 7.1 Guard proxies

A guard wraps a namespace object. Known keys pass through untouched; an unknown string key throws:

```js
// src/agent/guard.js (shared by the engine and the agent)
const PROBES = new Set(['then', 'toJSON', 'constructor', 'valueOf', 'toString', 'inspect', 'asymmetricMatch',
  '$$typeof', 'prototype', 'length', 'name', 'call', 'apply', 'bind']);
export function guard(target, path, { members = null, about = {} } = {}) {
  return new Proxy(target, {
    get(t, k, r) {
      if (typeof k !== 'string' || k in t || PROBES.has(k)) return Reflect.get(t, k, r);
      const names = members ?? Object.keys(t).filter(n => !n.startsWith('_'));
      const near = closest(k, names);               // edit distance ≤ 2, or a shared prefix
      throw new TypeError(`${path}.${k} does not exist` + (near.length ? `; did you mean ${near.map(n => path + '.' + n).join(' or ')}?` : '.') +
        (about[k] ? ' ' + about[k] : '') + ` ${path} has: ${names.join(', ')}. help('${path}')`);
    },
  });
}
```

Where guards apply:

- **In scripts and in the sandbox:** `j` and every namespace object under it (`j.fit`, `j.lib`, `j.region`, `j.sel`,
  `j.hole`, `j.pattern`, `j.tx`, `j.plane`, `j.axis`, `j.c`, `j.inspect`, …), wrapped once in `makeJ()`. Functions
  that also carry properties (`j.frame`) are wrapped the same way; a Proxy over a function still calls it.
- **In the agent's scope:** `files`, `program`, `params`, `view`, `presets`, `measure`, `lab`. An unknown top-level
  name stays a JavaScript `ReferenceError`; the hint table adds the nearest scope name (7.3).
- **Not:** builder handles (Part, Sketch, …), Programs and plain values, for the optional-chaining reason in 4.3.

`about` holds sentences for names models are known to guess: `j.fit.holeComp` → "Hole compensation is part of
j.fit.hole(d, class)"; `program.metric` → "program.metrics(names) takes a list".

### 7.2 Argument checks that name the call

A small helper validates arguments at the API boundary and throws with the call, the argument and the accepted forms.
The first users are the calls the transcripts hit:

```text
j.fit.hole(d, class): d is the param name 'md', which has no value while .params() is being read.
In .params() write 'md + 2 * gap.press' (+ hole compensation, 0.1 mm by default); inside a feature,
j.fit.hole('md', 'press') works. help('j.fit.hole')
```

The rule for lengths becomes uniform: a number (mm), a quantity, a param name or an expression string, or the error
says which form this position does not take.

### 7.3 A hint table for engine errors

Errors the guards cannot prevent get one hint line appended, without replacing the message:

| Pattern | Hint |
|---|---|
| `ReferenceError: (window\|document\|fetch\|localStorage) is not defined` | the sandbox has no page and no network; use the workbench calls (`files`, `look`, …) |
| `ReferenceError: X is not defined`, X close to a scope name | did you mean Y? |
| `X.m is not a function`, m close to a builder method | did you mean `.fillet`? (Part has: …) |
| `Cannot read properties of undefined (reading 'volume')` | a call returned no such field: `check()` and `run()` give `metrics`/`summary` only when `ok`; read `errors` first |
| `… takes a number, got NaN` | a param name or expression reached a function that needs a number here; see the call's help |

### 7.4 Values that describe themselves

The YAML writer asks a value for `describe()` when it has one. Engine values gain it:

| Value | YAML |
|---|---|
| Quantity | `6.2 mm` |
| Region | `region: 1 outline, area 1,520.4 mm², bbox 44 × 57.2 mm` |
| Part (builder) | `part cat-magnet-pin: body (extrude) · foot (chamfer) · face (cut) · magnet (hole)` |
| Sketch | `sketch face: 9 entities, 0 constraints` |
| Selector | `selector "%plane and |Y"` |
| Program | the summary fields |

(The numbers in this table are illustrations of the format, not computed values.)

### 7.5 The library fixes

- Library cutters place their cut from the placement point *into* the surface: `j.lib.magnet` today builds its pocket
  from z = 0 up to h + 0.2; it becomes z = −(h + 0.2) to +0.01, like `j.lib.dowel`. Presets that use it are checked.
- `j.fit.hole('md', …)` in `.params()`: resolved through the param scope, or refused with 7.2's message.

## 8. One documentation registry

### 8.1 Records

`src/agent/docs.js` holds one record per documented name:

```js
{ path: 'check', sig: 'check(variant?, options?)', group: 'compile', where: 'sandbox',
  returns: '{ ok, ms, errors, warnings, summary, metrics, program }',
  about: 'compiles the current files, or a variant, in the sandbox; nothing in the workbench changes',
  example: "const r = await check(files.read('script.js').replace('mm(2)', 'mm(2.4)'))", see: ['run'] }
```

### 8.2 What is generated from it

- **The reference's scope table.** `src/agent/reference.md` keeps its prose; the marker `<!-- agent-scope -->` is
  replaced by rows rendered from the registry when the reference is assembled. A test fails when a scope name has
  no record or a record names no scope function.
- **`help(x)`.** In the sandbox and in scripts. `help()` lists the scope by group; `help('check')` or `help(check)`
  gives the record; `help(j.fit)` lists the namespace's members with one line each; `help(part)` lists a builder's
  methods and its features; `help(value)` says what the value is.
- **Guard and hint messages** end with `help('…')` for the name involved.

The evidence in 4.3 says models rarely call help. The registry is still worth it because it keeps the reference
correct and makes every error's pointer real.

## 9. One result shape

No backward compatibility is kept; the prompt, reference and cases change with the code.

| Call | New shape |
|---|---|
| `run()` | `{ ok, ms, errors, warnings, summary }` |
| `check()` | `{ ok, ms, errors, warnings, summary, metrics, program, logs }` (`summary`, `metrics` only when `ok`) |
| `program.summary()` | `{ ok, kind, name, features, bodies, sketches, dof, faces, volume, mass, bbox, … }`: the same object `run()` and `check()` return as `summary` |
| `program.metrics(names?)` | plain numbers `{ volume: 15552, mass: 19.28, … }`; `program.metrics({ detail: true })` gives `{ value, unit, fidelity }` |
| `program.bodies()` | `[{ id, part, faceCount, edgeCount, bbox }]` |

`logs` in `check()` is new: `log(…)` inside a compiled script is captured, so a script can report a value it computed.

## 10. API reference: what is new or changed

| Name | Where | Change |
|---|---|---|
| `j`, `mm`, `cm`, `m`, `inch`, `deg`, `rad`, `lw`, `layer`, `data` | sandbox | new in the agent's scope |
| `check(variant?, options?)` | sandbox | local compile; returns a live `program`; `logs` |
| `help(x?)` | sandbox, scripts | new |
| `program.metrics({ detail })` | page | plain numbers by default |
| `program.bodies()` | page | `faceCount`, `edgeCount` |
| guards on namespaces | both | unknown names throw with the right ones |
| `log()` in scripts | engine | captured into `check().logs` and `run().logs` |

## 11. Implementation plan

Each phase ends with its tests and a commit; phases 2–5 end with a measured batch.

**Phase 0 — measurement.**
- `tools/agent-eval/failures.mjs RESULTS…`: failed steps by class (the table in 4.1), runs affected, evals to
  recover after a failure, stuck loops (three or more failures in a row), and coverage of scope functions.
- `test/agent/lint.test.mjs`: calls scope functions with junk (`undefined`, `null`, `''`, `42`, `{}`, `[]`) against the
  mock host and `j.*` functions against the engine; a message that does not name the call, or that contains
  `NaN`, `undefined is not`, `Cannot read properties` or `[object Object]`, is listed. The test enforces the list of
  functions already fixed and prints the rest.
- Baseline batch: all cases, both tiers, `--look chrome`, from a frozen worktree.

**Phase 1 — the sandbox.**
- `src/agent/sandbox/runner.js` (scope assembly, guards, tracking, YAML, hints), `protocol.js`, `worker-main.js`,
  `frame.js` (page client: iframe, bytes, restarts), `serve.js` (allowlist, read-only, ctx), `node.js` and
  `node-worker.mjs`.
- `build.mjs`: the `dist/agent-worker.js` bundle.
- `evaltool.js`: run through the sandbox when one is available; tracked promises move into the runner.
- Tests: protocol round trip, read-only refusal across the port, timeout restart, globals cleared, `j` native,
  `check()` returning a live program, bridged calls unchanged.

**Phase 2 — errors.** `guard.js` in `makeJ()` and the scope; argument checks for fit, lib, hole, region; the hint
table; `describe()` on engine values; the magnet direction; `j.fit.hole` in params.

**Phase 3 — documentation.** `docs.js`, the reference marker, `help()`, the registry test, the prompt rewritten for
the sandbox (the language in reach, each step clean, `help()`).

**Phase 4 — shapes.** As in section 9, with the reference, prompt and cases.

**Phase 5 — evaluation.** The failure report and the full set on both tiers after each phase; two new cases (build a
magnet pin preset; make a pocket a press fit for a 6 × 3 mm magnet).

## 12. Testing strategy

| Level | What | Where |
|---|---|---|
| unit | guard messages, closest names, hint table, describe() | `test/agent/guard.test.mjs`, `hints.test.mjs` |
| unit | runner with a fake port: local and bridged calls, ctx refresh, read-only, function arguments refused | `test/agent/sandbox.test.mjs` |
| integration (Node) | the Node sandbox with the real engine: `j` native, `check()` live program, timeout restart | `test/agent/sandbox-node.test.mjs` |
| browser | the iframe sandbox in headless Chrome: no network (`fetch` refused), no `localStorage`, an eval end to end | a script in the ticket, run with the harness's Chrome |
| engine | guards in `makeJ()` do not break any preset or engine test | `test/engine/run.mjs`, `test/engine-core/run.mjs` |
| lint | the message lint | `test/agent/lint.test.mjs` |
| agent | the harness batches | `tools/agent-eval.mjs` |

## 13. Risks and open questions

- **Memory.** Two OpenCascade instances. Measure the sandbox's memory after start and after a check of the largest
  preset; if it is too much, the sandbox can drop its engine after a period without evals.
- **Start-up.** About a second; started when the agent panel mounts, so the first eval rarely waits.
- **claude.ai.** Inside claude.ai the page is itself an artifact frame with its own policy; a `srcdoc` frame inherits
  the parent's CSP. Kiln works there with the same construction; jigcad must be checked there before release.
- **Guards in the engine.** Engine code that probes `j.x` for an optional member would throw. The engine suites run
  with guards on before the phase is committed.
- **Two compiles of the same files.** `program.*` (page) and `check()` (sandbox) compile the same files on two engines;
  they must agree. A test compares their summaries on every preset.

## 14. File reference

| File | Role |
|---|---|
| `import/jigcad/src/agent/turn.js` | one turn: thread, blocks, tool, errors |
| `import/jigcad/src/agent/evaltool.js` | the eval tool; today's in-page runner; snapshots |
| `import/jigcad/src/agent/scope.js` | the lab scope (bridged side after JIG-012) |
| `import/jigcad/src/agent/prompt.js` | instructions, context, history |
| `import/jigcad/src/agent/reference.md` | the reference the model reads |
| `import/jigcad/src/agent/yaml.js` | result formatting |
| `import/jigcad/src/host/host.js` | the page's state and engine client |
| `import/jigcad/src/host/engine.js` | promise RPC to the engine worker |
| `import/jigcad/src/host/sample-http.js` | `sample` over `jigcad serve` |
| `import/jigcad/src/engine/worker.js` | the engine worker's ops |
| `import/jigcad/src/engine/j.js` | the `j` namespace |
| `import/jigcad/src/engine/oc.js`, `src/engine/rs/wasm.js` | wasm loading (accept bytes) |
| `import/jigcad/src/engine/lib.js`, `fit.js` | library parts and fits |
| `import/jigcad/build.mjs` | the bundles |
| `import/jigcad/tools/agent-eval*` | the harness |
| new: `src/agent/sandbox/*`, `src/agent/guard.js`, `src/agent/hints.js`, `src/agent/docs.js`, `tools/agent-eval/failures.mjs`, `test/agent/lint.test.mjs` | this ticket |

## 15. References

- JIG-011 analysis and design (the Cat magnet pin transcript; the first API design).
- factory-videos: FACTORY-AGENTERR-001 design doc §5–6, FACTORY-AGENTERR-002 §4.5, FACTORY-JSDRILL-001 §2,
  FACTORY-REPORTFIX-002 Phase 5, `docs/agent-evaluation-playbook.md`.
- Kiln: `apps/workbench/src/agent/sandbox.js`, `frame.js`, `encode.js`, `inspect.js`, `agent-guidelines.txt`.
- Form Skate: `app/host.js` `labScope`, `content/reference.md` "The agent's eval scope".
