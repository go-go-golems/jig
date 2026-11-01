---
Title: 'Intern guide: the agent''s async model, synchronous reads in the sandbox and loud promises'
Ticket: JIG-013-AWAIT-RULE
Status: active
Topics:
    - agent
    - sandbox
    - api
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "The agent's scope mixes synchronous and asynchronous calls by accident of where they are answered; unawaited promises are the largest failure class (31 steps in 29 of 66 runs). This guide makes reads synchronous in the sandbox (a shadow of the page's program), keeps compiles, drawings and workbench changes asynchronous, makes a forgotten await loud, awaits returned values, and states the rule in the reference and prompt."
LastUpdated: 2026-11-01T18:39:17.684894421-05:00
WhatFor: "Design and implementation guide for JIG-013"
WhenToUse: "Before changing the agent scope's sync/async split, the sandbox runner, or the engine worker's program slots"
---

import sys
p=sys.argv[1]; s=open(p).read()
head=s[:s.index('# Intern guide')]
head=head.replace('Summary: ""','Summary: "The agent\'s scope mixes synchronous and asynchronous calls by accident of where they are answered; unawaited promises are the largest failure class (31 steps in 29 of 66 runs). This guide makes reads synchronous in the sandbox (a shadow of the page\'s program), keeps compiles, drawings and workbench changes asynchronous, makes a forgotten await loud, awaits returned values, and states the rule in the reference and prompt."')
head=head.replace('WhatFor: ""','WhatFor: "Design and implementation guide for JIG-013"').replace('WhenToUse: ""','WhenToUse: "Before changing the agent scope\'s sync/async split, the sandbox runner, or the engine worker\'s program slots"')
body=open('/dev/stdin').read()
open(p,'w').write(head+body)
# Intern guide: the agent's async model, synchronous reads in the sandbox and loud promises

This guide explains why the agent in jigcad keeps forgetting `await`, and what changes so that it stops mattering.
It assumes you have read the JIG-012 guide (the sandbox, guards, hints, the docs registry), but it repeats what
this ticket depends on. By the end you should be able to say, for every name in the agent's scope, whether it
returns a value or a Promise and why, and to find the code that makes it so.

## 1. The problem in numbers

The agent works through one tool, `eval`, whose input is the body of an async JavaScript function. Some of the
functions in its scope return values (`files.read`, `program.metrics`); others return Promises (`run`, `check`,
`faces`). A Promise used as if it were the value fails in one of two ways:

- **Loudly, one line later.** `faces('%plane').map(…)` throws `TypeError: faces(...).map is not a function`.
- **Silently.** `const r = check(); return r.ok` returns `undefined`; `run(); return 1` returns 1 while the
  compile is still running.

Since JIG-004 the evaluator tracks every Promise the scope returns and adds a note when the step never awaited
one: `note: check() returned a Promise that this step never awaited. Write: const x = await check();`. The note
explains the mistake after it happened. It does not prevent it.

The JIG-012 phase 2 batch (66 runs of 33 cases on two models) measured what is left:

| Class | Steps | Runs |
|---|---:|---:|
| promise not awaited | 31 | 29 (44 % of runs) |
| — of which the step failed | 15 | |
| — of which the step "succeeded" with a wrong value | 16 | |
| every other misuse class together | 20 | 12 |

The calls left unawaited were `faces` 11, `check` 10, `run` 9, `params.get` 2, then `sketch`, `params.clear`,
`view.set`, `feature` once each. It is the largest failure class, and the only one that grew between the
baseline (25 runs) and phase 2 (29 runs): the notes and hints from JIG-012 help the next step, not the first.

## 2. Why the model gets it wrong

Two causes, both in our code, not in the model.

**The docs never say which calls return a Promise.** The reference says once that the code "can `await`". In the
scope table only `look` is written as `await look(…)`. The prompt's "How to work" section writes "call run() and
read the result: { ok, errors }" and "check(variant) compiles a variant": both read as synchronous.

**The split follows plumbing, not meaning.** About half of the scope is synchronous: `files.read(...).split()`
appears in 992 steps of the history, and all `program.*` reads are synchronous. A model generalises from the
calls it uses most. Nothing tells it that `faces()` — which reads like `program.bodies()` — is different. And
`check()`'s live program is asynchronous where the page's `program` is not.

Why is `faces` asynchronous at all? Not because answering it takes time. Answering it is a lookup on a compiled
Program (`Program.faces(sel)` in `src/engine/program.js` is synchronous). It is asynchronous because the Program
lives in another thread: before JIG-012 in the page's engine worker, since JIG-012 behind a message port from the
sandbox to the page. Every message across a port is asynchronous.

## 3. The rule

The new contract has one sentence:

> **Reading is synchronous. Anything that compiles, draws, or changes the workbench returns a Promise: `await` it.**

| Synchronous (read) | Asynchronous (compile, draw, change) |
|---|---|
| `files.list/read/grep` | `run()` |
| `files.edit/write/rename/remove` (the page follows in order) | `check(variant?, options?)` |
| `program.*` — summary, metrics, diagnostics, params, trace, decisions, graph, ir, bodies, print | `look(view?, o?)` |
| `why`, `faces`, `feature`, `sketch` | `params.set`, `params.clear` |
| `measure.*` — face, edge, distance, angle, bbox, area | `presets.load`, `presets.create` |
| `params.list`, `params.get`, `params.overrides` | `exportFile(format, o?)` |
| `selection`, `select`, `view.get`, `view.set`, `presets.list/current/rename` | |
| `check().program` and all its reads | |
| `j`, the units, `data`, `help`, `lab.*`, `log` | |

Two facts make the rule safe to follow:

- `await` on a value that is not a Promise is harmless: `await files.read('x')` is the text. A model that awaits
  too much is never wrong. The docs say so.
- A Promise from the right-hand column that is used as a value throws at once, with the fix (section 6).

Why not make everything asynchronous instead? That is also a consistent rule, but it makes the most common code
worse: `files.read(p).split('\n')` becomes `(await files.read(p)).split('\n')`, and `names.map(n =>
measure.face(n))` needs `await Promise.all(…)`. Composition in JavaScript is easier with values. Asynchrony buys
nothing here either: one engine answers every query in order, so `Promise.all` over queries saves no time, and a
runaway step is stopped by ending its worker, not by cancelling a Promise.

## 4. Background you need

### 4.1 Where a step runs

```text
 page (Host, src/host/host.js)                    sandbox worker (src/agent/sandbox/runner.js)
 ┌─────────────────────────────────────┐          ┌──────────────────────────────────────────┐
 │ files, overrides, program, lastGood  │  ctx →   │ mirror host (copy of ctx)                 │
 │ engine worker: the page's Program    │          │ labScope(mirror): files, program, …       │
 │ labScope(host): checks every call    │ ← call   │ stubs for effects (run, look, params.set) │
 │                                      │  ret →   │ its own engine (W = engine/worker.js)     │
 └─────────────────────────────────────┘          │   check() compiles here                    │
                                                   └──────────────────────────────────────────┘
```

- `ctxOf(host)` (`src/agent/sandbox/serve.js`) is the page state sent with each step: files, edited flags,
  overrides, `program`, `lastGood`, selection, view, presets.
- `mirrorHost(ctx, callRaw)` in `runner.js` is a host object over that copy. `labScope(mirror)` runs the same
  scope code as the page, so synchronous calls stay synchronous.
- Engine queries go through `mirror.call(method, …args)` → `callRaw` → a `__call` message to the page →
  `host.call` → the page's engine. This hop is what makes `faces` asynchronous in the sandbox.
- `check()` compiles in the sandbox's own engine (`W.compileFiles`) and returns `program`, a live view built by
  `liveProgram(data, gen)` whose host's `call` goes to `W.call`, also asynchronous.

### 4.2 The engine's programs

`src/engine/worker.js` keeps one `current` Program. `compileFiles` replaces it; `call(method, args)` answers on
it. After each compile, `releasePrograms(current)` and `gc()` (`src/engine/program.js`) free every kernel body
(OpenCascade shape) that the feature cache and the live programs do not reference. So two Programs alive at once
in one worker need both to be in `livePrograms`, or the second compile frees the first one's bodies.

Selector text that starts with `j.` (`faces("j.sel.faces('>Z')")`) is evaluated by `evalArg` with `runScript`,
which is `async` because scripts are async function bodies. That is the only asynchronous part of `call`.

### 4.3 Promise tracking

`trackScope(scope, promises)` in `src/agent/evaltool.js` wraps every scope function. When a call returns a
Promise, `track(p, label, promises)` records `{ p, label, consumed, settled, error }` and marks it consumed when
its `then` is called (which `await` does). After the step, `promiseNotes(promises)` writes a note for each
Promise never consumed, and the evaluator waits at most one second for pending ones.

## 5. Design A: synchronous reads in the sandbox

### 5.1 The shadow program

The sandbox compiles the same inputs the page compiled last, in its own engine, and answers reads from that
Program synchronously. We call it the **shadow**.

- **Inputs.** The page records, on every compile that succeeds, the files and the override values it compiled
  (`host.goodInputs = { files, override }`), next to `host.lastGood`. `ctxOf` sends `goodInputs` and
  `lastGood.hash`.
- **When it is built.** Before a step's code runs, the runner compares the shadow's key (the page's `lastGood`
  hash) with the one in `ctx`. If they differ, it compiles `goodInputs` into the shadow slot (asynchronously —
  the step has not started yet). Bridged calls that recompile the page (`run`, `params.set/clear`,
  `presets.load/create`) refresh `ctx` and rebuild the shadow before they return, which they can do because
  they are asynchronous anyway.
- **Check.** The shadow's `data.hash` must equal the page's `lastGood.hash`. The engine is the same bundle and
  the inputs are the same, so they match. When they do not (a bug), reads throw a message saying so instead of
  answering from a different model.
- **No good compile.** When the page has none, reads throw `no successful compile yet; fix the errors and run()
  again`, as on the page.

```text
step starts ──► ctx.lastGood.hash == shadow.hash ? ──yes──► run the code
                         │ no
                         ▼
               W.compileFiles(goodInputs, { slot: 'shadow' }) ──► shadow = { P, hash } ──► run the code

inside the code:  faces('%plane')  ──► P.faces(sel) on the shadow ──► records (sync)
                  await run()      ──► bridged to the page ──► ctx refreshed ──► shadow rebuilt ──► result
```

### 5.2 Engine slots

`compileFiles` gets `options.slot` (default `'current'`). The worker keeps a `Map` of slots; after a compile it
calls `releasePrograms(...slots.values())`, so every slot's bodies survive `gc()`. A what-if (`keep: false`)
keeps the slots as they are. `releasePrograms` accepts several programs.

The sandbox uses two slots: `shadow` (the page's last good compile) and `check` (the last `check()`). The page's
engine uses only `current`, as before.

### 5.3 Synchronous calls

`W.callSync(slot, method, args)` answers on a slot's Program without `await`. Selector text starting with `j.`
is evaluated synchronously (a plain function over `j`, the units and `data`, not an async script body). Selector
values (`j.sel.faces('>Z').of('body')`) pass through: in the sandbox they are in the same realm as the engine,
which is new — on the page they had to be text.

`makeQueries(host)` and `makeMeasure(host)` in `src/agent/scope.js` use `host.callSync` when the host has one,
and the asynchronous `host.call` otherwise:

```js
// one query path for both: a value when the host answers synchronously, a Promise when it does not
function ask(host, method, verb, args, shape) {
  if (typeof host.callSync === 'function') {
    let v;
    try { v = host.callSync(method, ...args); } catch (e) { throw new Error(`${verb}: ${e.message}`); }
    return shape(v);
  }
  return call(host, method, verb, ...args).then(shape);
}
```

`program.ir(level, { node })` and `params.get(name)` take the same path. The mirror host gets
`callSync = (m, ...a) => W.callSync('shadow', m, a)`; `liveProgram` gets one over the `check` slot, with the
staleness check it has today (a program from an earlier `check()` refuses to answer).

### 5.4 The page fallback

When the sandbox cannot run a step, the step runs on the page (`runEval`), where reads cross to the engine worker
and stay asynchronous. The fallback note says so. This path is rare (the sandbox failed to start) and is not
measured.

### 5.5 Cost

A compile in the sandbox each time the page's good compile changes: once per `run()` that succeeds, and once at
the start of a case. A-01 compiles in tens of milliseconds; the largest presets (M-10, X-08) in about a second.
Memory: two Programs per sandbox worker instead of one.

## 6. Design B: loud promises

The right-hand column of section 3 still returns Promises. A Promise used as a value should fail where it is
used, with the fix. `track()` returns a Proxy over the Promise:

```js
const PASS = new Set(['then', 'catch', 'finally', 'constructor', 'toString', 'valueOf']);
function loud(p, label) {
  return new Proxy(p, {
    get(t, k) {
      if (typeof k === 'symbol' || PASS.has(k)) {
        const v = Reflect.get(t, k, t);
        return typeof v === 'function' ? v.bind(t) : v;   // then() must run on the real Promise
      }
      throw new TypeError(`${label} returned a Promise: write (await ${label}).${String(k)}`);
    },
  });
}
```

- `await x`, `x.then(…)`, `Promise.all([x])`, `Promise.resolve(x)` all work: they read `then` (and only `then`).
- `check().ok` throws `TypeError: check() returned a Promise: write (await check()).ok (line 1)`.
- `const r = run(); return r.summary` throws at `r.summary` instead of returning `undefined`.
- `x instanceof Promise` stays true (the Proxy's prototype is the Promise's).

The failure classifier (`tools/agent-eval/failures.mjs`) counts this message as "promise not awaited".

## 7. Design C: returned values and pending calls

Two places where the evaluator can await on the model's behalf, without changing what the code means:

- **Promises inside the returned value.** `return { r: check() }` today shows `<Promise from check(): not
  awaited>`. The evaluator walks the returned value (plain objects and arrays, depth ≤ 8) and replaces each
  Promise by its value (or `<check() failed: message>`), and marks it consumed, so no note.
- **Calls left running.** `run(); return 1` today waits at most one second for `run()`. The evaluator waits for
  every pending tracked call until the step's time runs out, so a compile or a `params.set` started and forgotten
  finishes, and its failure is reported. The note stays: the returned value may not reflect the call.

## 8. Design D: the docs say it

- `src/agent/docs.js` records get `async: true` for the right-hand column. The scope table renders their
  signatures as `await run()`, `await check(variant?, options?)`; `help()` shows the same.
- The reference's scope paragraph states the rule and that `await` on a value is harmless.
- The prompt (`src/agent/prompt.js`) states the rule in one line and writes its examples as `const r = await
  run()`.
- `failures.mjs` takes its list of asynchronous names from the registry instead of its own copy.

## 9. Engine messages found by the JIG-012 batch

The batch after JIG-012 phase 4 showed messages that do not teach:

- `faces('')` and `faces()` — the agent wants every face. Today: `faces: give a selector as text … (got empty
  text)` in the scope, and `faces: faces: expected a selector, query text or face name, got undefined` (prefix
  doubled) on `check().program`. New: no selector (or `'*'`) lists every face.
- `add magnetPocket failed: Cannot read properties of undefined (reading 'type')` — an engine error that leaked
  in one run of `a01-magnet-pocket` after a sequence of edits; replaying the same edits on the harness host does
  not reproduce it. Feature failures that are JavaScript errors (`TypeError`, `ReferenceError`) get the
  feature's arguments and the first frames of the engine stack in the diagnostic, so the next occurrence can be
  diagnosed. Logged as an open issue.

## 10. API reference (what changes)

| Name | Before | After |
|---|---|---|
| `why(t)`, `faces(sel?)`, `feature(id)`, `sketch(id)` | Promise | value (sandbox); `faces()` lists every face; `sel` may be a selector value |
| `measure.area(x)` | Promise | value (sandbox) |
| `params.get(name)` | Promise | value (sandbox) |
| `program.ir(level, o?)` | Promise | value (sandbox) |
| `check().program.*` | Promises for queries | values |
| `run`, `check`, `look`, `params.set/clear`, `presets.load/create`, `exportFile` | Promise | Promise that throws when used as a value |
| `return { x: <Promise> }` | marker string | the value |
| forgotten `run()` | waited ≤ 1 s | waited until the step's time runs out |

## 11. Files

| File | Change |
|---|---|
| `src/engine/program.js` | `releasePrograms(...keep)` |
| `src/engine/worker.js` | slots in `compileFiles`, `callSync`, synchronous selector evaluation, `slotProgram` |
| `src/host/host.js` | `goodInputs` on a successful compile |
| `src/agent/sandbox/serve.js` | `ctxOf` sends `goodInputs` |
| `src/agent/sandbox/runner.js` | the shadow (`ensureShadow`), `callSync` on the mirror and the live program, rebuild after bridged recompiles |
| `src/agent/scope.js` | `ask()`: one query path, sync or async by host; `faces()` with no selector |
| `src/agent/evaltool.js` | `loud()` in `track`; deep-await of the returned value; wait for pending calls |
| `src/agent/docs.js`, `reference.md`, `prompt.js`, `help.js` | the `async` flag, the rule |
| `tools/agent-eval/failures.mjs` | ASYNC from the registry; the loud message's class |
| `test/agent/*.test.mjs` | sync reads, loud promises, deep-await, shadow hash equality |

## 12. Implementation plan

1. **Engine slots and `callSync`** (`program.js`, `worker.js`), with a test that two slots survive `gc()` and that
   `callSync` answers like `call`.
2. **The shadow** (`host.js` goodInputs, `serve.js`, `runner.js`), synchronous `makeQueries`/`makeMeasure`/
   `ir`/`params.get`, `liveProgram` over the `check` slot; tests in `sandbox.test.mjs`.
3. **Loud promises, deep-await, pending calls** (`evaltool.js`, runner), tests.
4. **Docs**: registry flag, table, help, reference, prompt, `failures.mjs`.
5. **Engine messages**: `faces()` lists all; JavaScript errors in features carry their stack.
6. **Measure**: batch with `--repeat 2` from a frozen worktree; failure report; compare with JIG-012's batches.

## 13. Risks

- **Shadow drift.** If the shadow and the page disagree, reads answer about a different model. The hash check
  turns that into an error; a test compiles every preset in both paths in CI-sized form (A-01 and a multi-body
  preset).
- **Time.** A step after a large `run()` pays a second compile in the sandbox. Measured in phase 6.
- **Proxied Promises in libraries.** Code that inspects a Promise's own properties (rare in eval code) now
  throws. Allowed: `then`, `catch`, `finally`, `constructor`, `toString`, `valueOf` and every symbol.
- **The fallback differs.** On the page, reads stay asynchronous. Recorded in the fallback note.
