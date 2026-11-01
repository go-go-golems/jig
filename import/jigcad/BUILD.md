# jigcad: build contract

jigcad is the jig CAD language (spec: `guides/jig-spec-README.md`, examples: `guides/jig-spec-examples/`) implemented for real, inside a workbench styled and written by four design guides:

| Guide | Folder | Governs |
|---|---|---|
| Form Skate Workbench (Kiln) | `guides/workbench/` | the shell, dock, panels, editor, reading views, UI copy, book-section writing |
| Form Skate Stage | `guides/stage/` | the drafting-sheet 3D view: projection, line weights, hatching, labels, overlays |
| Form Skate Agent | `guides/agent/` | the coding agent: one `eval` tool, modes, steps, revert, voice, system prompt |
| Executable Textbook Handbook | `guides/handbook.html` | the Book: method, chapter shape, computed figures, runnable sketches |

The guides describe a skateboard game. Translate, don't copy: keep their look, structure, rules and voice; replace skate content with CAD content (systems → features, signals → parameters, tricks → features/results, the skater → the part). Where a guide names a skate-specific thing with no CAD analogue, drop it.

Everything is plain ES modules (JSX for UI, compiled to preact). No npm: vendored sources are in `vendor/` and aliased in `build.mjs`. Build with `node build.mjs`; serve `dist/` (e.g. `cd dist && python3 -m http.server 8765`). The deliverable is `dist/` published as one artifact (index.html, app.js, worker.js, occt/replicad_single.wasm.gz, fonts/).

## 1. Architecture

```
main thread                                          worker thread (src/engine/worker.js)
───────────                                          ─────────────────────────────────────
src/main.jsx      mounts the app                     OpenCascade (vendor/occt, loaded from .wasm.gz)
src/host/host.js  state + API (files, program,       replicad (vendor/replicad) for convenience only
                  selection, compile, export)  ⇄     src/engine/*  the jig language: j namespace,
src/host/engine.js  worker client (promise RPC)        builders, compile → ProgramData
src/ui/*          Kiln workbench (preact)
src/stage/*       drafting-sheet renderer (canvas)
src/agent/*       agent panel, eval tool, lab scope
```

Units are millimetres and radians internally; angles are shown in degrees.

## 2. Worker protocol (src/host/engine.js ⇄ src/engine/worker.js)

Every request is `{ id, op, ...args }`; every reply is `{ id, ok: true, ...result }` or `{ id, ok: false, error: { message, stack, line?, column?, file? } }`. Typed arrays in replies are transferred.

| op | args | reply |
|---|---|---|
| `init` | — | `{ ms, version }` |
| `compile` | `files: {path: text}`, `entry: 'script.js'`, `data?: {}`, `options?: { config?, override?: {name: value}, fit?, seed? }` | `{ program: ProgramData }` — the worker keeps this Program for `call` |
| `call` | `method`, `args` | `{ value }` — methods: `why(target)`, `param(name)`, `ir(level, { node })`, `feature(id)`, `faces(selectorText)`, `sketch(id)`, `metric(name)`, `find(kind)` |
| `solveSketch` | `sketchId`, `drag: { ref, to: [x, y] }` | `{ sketch: SketchData }` — runtime residual solve, warm-started |
| `export` | `format: 'stl' \| '3mf' \| 'step' \| 'ir' \| 'svg'`, `options` | `{ data: ArrayBuffer \| string, filename, mime, report: { kept, approximated, dropped, maxDeviation? } }` |
| `run` | `code`, `files?` | `{ value }` — runs `code` as an async function body in the worker with `j`, the bare unit names and `compile(scriptText) → ProgramData` in scope; for headless tests and search |

A script (`script.js`) is a **function body** run with these names in scope: `j`, every bare name of README §10 (`mm cm m um inch ft deg rad turn kg gram N kN MPa GPa s minute hour degC usd eur lw layer nozzle bbox`), and `data` (the preset's data files parsed: `.json` → object, `.csv` → `{ columns, rows }`, other text → string). It returns a builder (part, sketch, assembly, print job, region, design). Script errors report the line and column within `script.js`.

## 3. ProgramData (what `compile` returns; plain data, structured-cloneable)

```js
{
  ok: true, hash: 'b3:…', kind: 'part' | 'sketch' | 'assembly' | 'print' | 'design' | 'region', name: 'box',
  summary: { features: 6, bodies: 1, sketches: 1, dof: 0, faces: 11, volume: 72000, ... },   // flat, for pills and the agent
  metrics: { volume: { value: 72000, unit: 'mm³', fidelity: 'exact' }, mass: {...}, ... },
  diagnostics: [{ level: 'error' | 'warning' | 'info', kind: 'sketch.underConstrained', at: 'base', message, fix?, line? }],
  trace: [{ pass: 'feature:body', level: 'L4', ms: 3.1, cached: false, note: '…' }],
  decisions: [{ at: 'body', kind: 'op', chose: 'new', alternatives: ['join'], reason: '…' }],
  params: [{ name: 'w', value: 60, unit: 'mm', text: '60 mm', expr: null, src: 'params', deps: [], exposed: { label, range: [30, 200], step } | null }],
  graph: { nodes: [{ id: 'body', kind: 'extrude', label: 'body · extrude', level: 'L1' }], edges: [{ from: 'base', to: 'body', kind: 'profile' }] },
  sketches: [SketchData],
  bodies: [{
    id: 'box/body1', name: 'body1', part: 'box', color: null, transform: [16 numbers, column-major, world],
    mesh: { positions: Float32Array, normals: Float32Array, indices: Uint32Array, triFace: Uint32Array /* face index per triangle */ },
    faces: [{ index: 0, name: 'body/side[base.l1]', kind: 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'bspline' | 'other', area, center: [x,y,z], normal?: [x,y,z], axis?: { origin, dir, radius } }],
    edges: [{ index: 0, name: 'body/side[base.l1] ∩ body/end', kind: 'line' | 'circle' | 'other', points: Float32Array /* polyline xyz */, faces: [i, j] }],
    bbox: [[x0, y0, z0], [x1, y1, z1]],
  }],
  print: null | { printer: { name, bed: [250, 210, 220], nozzle: 0.4 }, plates: [{ index: 1, items: [{ body: 'box/body1', transform: [16] }] }],
                  orientation: { 'box': { dir: '+Z', supportVolume, bedContact, height, reason } },
                  overhang: [{ body, faces: [indices], area }], layers: null | { height: 0.2, count, sample: [{ z, loops: [[[x,y]…]] }] } },
  ir: { L0: 'text', L1: 'text', L2: 'text', L3: 'text', L4: 'text', L5: 'text', L6: 'text' },
}
```

`SketchData`: `{ id, plane: { origin, x, y, normal }, dof, status: 'fully' | 'under' | 'over', entities: [{ id, kind: 'point' | 'line' | 'arc' | 'circle' | 'spline', construction, p?, a?, b?, c?, r?, start?, end?, pts? (2D, solved) , dofFree: [names of free params] }], constraints: [{ id, kind, refs, value?, driven, status: 'ok' | 'redundant' | 'conflict' }], conflicts: [[constraint ids]], profiles: [{ loops: [[[x, y], …]], area, outer: 0 }] }`.

Persistent names follow README §4.4: `<featureId>/<role>[<source>]`, e.g. `body/side[base.l1]`, `body/end`, `body/start`, `fillet2/face[body/side[base.l1] ∩ body/end]`, `shell/inner[body/side[base.l2]]`. A face split by a later feature keeps its name with `#a`, `#b` suffixes. Faces with no genealogy get `<featureId>/face#<n>` and a `ref.fragile` note when referenced.

## 4. Host API (src/host/host.js) — used by the UI and wrapped for the agent

```js
host.files            // Map path → text (the open preset's files: script.js, notes.md, data files)
host.preset           // { id, title, group, about, ... meta }
host.program          // last ProgramData (or null); host.lastGood keeps the last successful one
host.selection        // { body, face, edge, name } | null
host.view             // { name: 'axo' | 'front' | 'side' | 'plan', yaw, pitch, scale, target, overlays: Set }
host.overrides        // param overrides from the Params view
host.on(event, fn)    // events: 'files', 'program', 'compiling', 'selection', 'view', 'preset', 'theme', 'toast'
host.setFile(path, text) · host.edit(path, oldText, newText) → { ok, error? }
host.compile()        // compile the current files with overrides → ProgramData (also sets host.program)
host.check(files)     // compile a variant without changing host state → ProgramData
host.call(method, ...args)        // forwards to the worker's 'call'
host.solveSketch(sketchId, drag)
host.export(format, options) → { data, filename, mime, report }
host.loadPreset(id) · host.presets() → [meta]
host.select(sel) · host.setView(patch) · host.toast(text, level)
host.snapshot() → files copy · host.restore(snapshot)
// added during integration:
host.check(files, { keep: false, merge, override, config })   // what-if compile; keep: false leaves host.program alone
host.reference() / host.referenceDocs()   // language reference + agent lab API, one source for people and the agent
host.loadScratch(files, meta)             // scratch presets get ids Z-nn (X-nn are the Electronics presets)
host.presetFiles(id) · host.findPreset(id) · host.preset.agent   // meta.json agent brief for the agent panel
```

## 5. Ownership (one owner per path; read anything, write only yours)

| Path | Owner |
|---|---|
| `src/engine/units.js expr.js params.js geom.js pattern.js sketch/*` and `test/engine-core/*` | **core** |
| `src/engine/*` (everything else: kernel, part, naming, select, lib, fit, inspect, print, io, compile, program, ir, laws, j.js, worker.js) and `test/engine/*` | **kernel** |
| `src/stage/*` and `test/stage/*` | **stage** |
| `src/main.jsx src/index.html src/ui/* src/host/*` and `test/ui/*` | **shell** |
| `src/agent/*` and `test/agent/*` | **agent** |
| `content/*` | **content** (later phase) |
| `build.mjs BUILD.md` | integrator (ask in your report if you need a change) |

## 6. Quality bar

- Real behaviour, not stubs: if a feature is in your scope, it works end to end or reports a clear diagnostic saying it is not supported yet.
- Every module has a quick test runnable with `node` (engine) or a Playwright script against `dist/` (UI, stage). Run them.
- Follow the guides' rules literally where they apply: tokens, two weights, 1 px rules, no radius, one red, tabular numbers, British spelling, sentence case, numbers with units.
- Keep files focused (under ~800 lines each). No new dependencies beyond `vendor/`.
- When you finish, report: what works (with the test output), what is partial, every deviation from this contract, and anything another owner must do.

## 7. Added during integration (sketches)

- SketchData entities and constraints carry `line` (script.js line of the call that made them; helper constraints: the helper's line; implied: the entity's line); dimensions carry `expr` when they come from an expression.
- Selection may be `{ sketch, constraint: id }` or `{ sketch, entity: id }` besides faces and edges; it survives recompiles by id. Hover previews: `host.hover`, `host.setHover(sel)`, event `hover`.
- `src/engine/callsite.js` holds `callerLine()` for core and kernel.

## 8. Serving with the Go model backend (JIG-002)

`node build.mjs` writes `dist/`. From the repository root, `go run ./cmd/jigcad serve` serves `dist/` on
`http://127.0.0.1:8787/` together with the agent's model backend: `POST /api/sample` (SSE), tool results on
`/api/sample/{call}/tools/{use}`, `/api/sample/{call}/cancel`, `GET /api/sample/models`. Model calls go through Pi's
agent directory (`~/.pi/agent`) with geppetto's `providers/pi`; tiers default to `lunaroute/glm-5.3-flash` (quick,
default) and `lunaroute/deepseek-4.1-flash` (complex), overridable with `--model-quick/-default/-complex`. The agent
panel uses `window.claude` when the page runs on claude.ai and the backend otherwise (`src/host/sample-http.js`).
`go build -tags embed ./cmd/jigcad` embeds `dist/` into one binary. A non-loopback `--listen` requires `--token`
(or `JIGCAD_TOKEN`); open `/?token=…` once to set the cookie. Go needs 1.26.6 or newer (`GOTOOLCHAIN=auto`).
