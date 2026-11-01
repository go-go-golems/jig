# Reference

The jig language as the workbench runs it, the agent's eval scope, and the lab: links. The agent reads this same page: it is appended to its instructions.

## Scripts

`script.js` is the body of a function. It runs with these names in scope and **returns a builder** (a part, sketch, assembly, print job, region or design):

```text
j  mm cm m um inch ft  deg rad turn  kg gram  N kN  MPa GPa  s minute hour  degC  usd eur  lw layer nozzle bbox  data
```

`data` holds the preset's data files parsed (`.json` → object, `.csv` → `{ columns, rows }`, other text → string). Do not redeclare these names; avoid `m`, `s`, `N` and `layer` as local names. Builders are immutable: every method returns a new builder. A typed slot takes a bare number in millimetres (`.dim('l1', 60)`); arrays of coordinates are in mm.

```js
const box = j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2) })
  .extrude(j.sketch('base', { on: j.plane.XY }).rect('r', 'w', 'd', { center: true }).profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
  .fillet(j.feat('body').sideFaces().edges('|Z'), mm(3), { id: 'corners' })
return box
```

### Quantities and params

- `mm(3)`, `deg(45)`, `j.q('1/4 in + 2 mm')`; `lw(n)` line widths (0.45 mm), `layer(n)` layer heights (0.2 mm), `nozzle(n)`. `q.add sub mul div min max clamp to('in')`; adding unlike dimensions throws `DimensionError`.
- `model.params({ wall: lw(3), h: mm(40), boss_d: 'wall * 4' })`: expressions are text and name other params. `.configs({ S: {…}, M: {…} })`, `.config('M')`, `.override({…})`, `.expose(['h'], { labels, ranges })`. Precedence, low to high: library default, `.params`, config row, `.override`, the Params view's overrides.

### Sketches

`j.sketch(id, { on: j.plane.XY | faceSel })` then `.point .line(id, a, b) .polyline .arc .circle(id, r, { at }) .rect(id, w, h, { center, r }) .polygon .slot .spline .text .offset .fillet .mirror .pattern .construction(...ids)`, `.constrain(j.c.horizontal('l1'), j.c.coincident(a, b), j.c.tangent(a, b), j.c.fix('l1.start'), …)`, `.dim(target, value)`. Refs: `'l1'`, `'l1.start'`, `'c1.center'`, `'rect1.top'`. `s.profiles()` gives every closed region; `s.profile(pick)` one. Status is `fully`, `under` or `over`; DOF = Σ entity DOF − rank J.

### Features

`j.part(name)` then `.extrude(profile, extent, { op, taper, id })` (extent: a length, `{ symmetric }`, `{ to: sel }`, `{ through: 'all' }`), `.cut`, `.revolve(profile, axis, angle)`, `.sweep`, `.loft`, `.hole(at, j.hole.clearance('M3') | .counterbore | .tapped | .insert | .nutTrap, opts)`, `.fillet(edges, r)`, `.chamfer(edges, d)`, `.shell(openFaces, t)`, `.draft`, `.rib`, `.emboss(region, depth, { on, op })`, `.pattern(targets, j.pattern.linear | circular | grid, opts)`, `.mirror`, `.add(libItem | shape | part, { at })`, `.feature(id, fn)`, `.suppress(id)`, `.insertAfter(id, b => …)`. Give `{ id }` to anything you will refer to; generated ids (`extrude1`) raise `ref.autoId`. `op` is `new`, `join`, `cut` or `intersect`; by default the first feature is `new` and later ones join when they touch a body. Primitives: `j.box j.cyl j.sphere j.cone j.torus`.

### Selectors and persistent names

`j.sel.faces('>Z')`, `j.sel.edges('|Z and %line')`: `+Z` normal points +Z, `|Z` parallel, `#Z` perpendicular, `>Z`/`<Z` farthest/nearest, `%plane %cylinder %line %circle`; combine with `and or not`. Then `.of(target) .where(fn) .largest() .near(pt) .and .or .minus .edges() .expect(n)`. Feature selectors read as intent and survive edits: `j.feat('body').endFace() .startFace() .sideFaces() .sideFace('l3') .edges(q) .holes()`. Avoid `.nth(i)`: it raises `ref.fragile`.

Faces are named by genealogy: `body/side[base.l1]`, `body/end`, `body/start`, `fillet2/face[body/side[base.l1] ∩ body/end]`, `shell/inner[body/side[base.l2]]`. A face split by a later feature keeps its name with `#a`, `#b`.

### Assemblies, fit and printing

`j.assembly(name).add(id, part, { at, ground }) .joint(id, j.joint.revolute(), a, b) .printInPlace(ids)`. Fit classes per side: press 0.05, snug 0.10, slide 0.20, free 0.30, print-in-place 0.40 mm (`j.fit.gap('slide')`, `j.fit.hole(d, 'snug')`). `j.print(name, { printer, material, parts: [part] }) .orient('auto' | '+Z' | fn) .supports({…}) .slice({ layer, walls, infill })`. `j.material('PLA' | 'PETG' | …)`, `j.rules.fdm`.

### The Program

A compile gives `summary` (features, bodies, sketches, dof, faces, volume, …), `metrics` (`{ value, unit, fidelity }`: exact, approx or heuristic), `diagnostics` (`{ level, kind, at, message, fix?, line? }`), `trace`, `decisions`, `params` (with value, expr, provenance and deps), `graph`, `sketches`, `bodies` (faces and edges with persistent names) and the IR levels: L0 source, L1 feature graph, L2 resolved params, L3 solved sketches, L4 topology, L5 world (placement, orientation), L6 products. Units: mm, mm², mm³, g, min; angles in degrees. Diagnostic kinds include `sketch.underConstrained`, `sketch.overConstrained`, `ref.fragile`, `ref.lost`, `ref.expect`, `feature.failed`, `fillet.tooLarge`, `fillet.tangent`, `brep.invalid`, `print.overhang`, `print.thinWall`, `export.lossy`. A feature the engine does not support yet compiles to an error diagnostic that says so.

## The agent's eval scope

The agent works through one tool, `eval`. Its input is `{ code }`, the body of an async function: the code can `await`, must `return` what it wants to see, and its `const` and `let` names do not carry over to the next step. The value comes back as YAML (numbers to 5 decimals, lists cut at 60 items, objects at 80 keys, 5 levels deep, typed arrays as `Float32Array(3600)`). Anything passed to `console.log` or `log` comes first, under `logs:` and a `---` line. A step is abandoned after 25 s with *eval timed out after 25 s*; a result over 9,000 characters is cut. An error reads `Error: <message> (line N)`, N being the line of the step's code.

The files are copied before each step; when a step changes a file, the step offers *revert files to before this step*. Revert restores files and recompiles; it does not restore params set with `params.set`. In **Ask** mode each step waits for *Run this step*; in **Read-only** mode `files.write`, `files.edit`, `files.rename`, `files.remove`, `run`, `params.set`, `params.clear`, `presets.load`, `presets.create` and `presets.rename` throw.

| group | name | returns |
|---|---|---|
| files | `files.list()` | `[{ path, lines, edited }]`, sorted |
| | `files.read(path, from?, to?)` | the whole file; with `from`, numbered lines `from` … `to` (40 lines by default) |
| | `files.grep(pattern, path?)` | up to 80 lines `file:line  text`; a string matches literally, a RegExp as a pattern |
| | `files.edit(path, find, replace)` | `{ path, line }`; throws when `find` is missing or occurs more than once |
| | `files.write(path, text)` | `{ path, lines }`; prefer `edit` |
| | `files.rename(from, to)`, `files.remove(path)` | `{ from, to }`; `{ removed }`. `script.js` keeps its name and stays; a step's revert brings files back |
| compile | `run()` | compiles the current files with the Params view's overrides and shows the result: `{ ok, ms, errors, warnings, summary }`; `errors` are `[{ level, kind, at, line, message, fix }]` |
| | `check(variant, options?)` | compiles a variant without touching the editor or the view: `variant` is the text of `script.js`, or `{ path: text }` for the files that differ; `options` (`{ override, config }`) go to the compiler. `{ ok, ms, errors, warnings, summary, metrics }`, metrics as plain numbers in their units |
| the program | `program.summary()` | `{ ok, kind, name, features, bodies, sketches, dof, faces, volume, … }` of the last compile |
| | `program.metrics(names?)` | `{ volume: { value, unit, fidelity }, mass: …, … }` |
| | `program.diagnostics(level?)` | `[{ level, kind, at, line, message, fix }]` |
| | `program.params(glob?)` | `[{ name, value, unit, text, expr, src, deps, range }]`; `glob` such as `'gap.*'` |
| | `program.trace()`, `program.decisions()` | compile passes `{ pass, level, ms, cached, note }`; choices `{ at, kind, chose, alternatives, reason }` |
| | `program.graph()` | `{ nodes: [{ id, kind, level }], edges: ['base → body profile', …] }` |
| | `program.ir(level, { node?, from?, to? })` | the text of IR level `L0` … `L6`, for one node, or numbered lines |
| | `program.bodies()`, `program.print()` | `[{ id, part, faces, edges, bbox }]`; plates, orientation, overhang and layers of a print job |
| queries | `why(target)` | resolved names, the genealogy chain and why each candidate was kept or dropped; `target` is selector text, `'param:wall'` or `'feature:shell'` |
| | `faces(selectorText)` | `[{ name, kind, area, center, normal, radius }]` for a query such as `'>Z'` or `'%cylinder'` |
| | `feature(id)`, `sketch(id)` | a feature's record (inputs, outputs, cache key); a sketch's `{ dof, status, conflicts, entities, constraints }` |
| measure | `measure.face(name)`, `measure.edge(name)` | `{ name, body, kind, area, center, normal, axis }`; `{ name, kind, length, faces }`, in world coordinates |
| | `measure.distance(a, b)`, `measure.angle(a, b)` | `{ distance, unit, how }` between faces, edges or points `[x, y, z]` (parallel planes and axes exactly, otherwise between centres); `{ angle, unit: '°' }` between normals, axes or directions |
| | `measure.bbox(body?)`, `measure.area(names or selector)` | `{ min, max, size }` in mm; `{ area, unit, faces }` |
| the bench | `selection()`, `select(name)` | the person's selection `{ name, body, face, edge }`, or `{ sketch, constraint }` / `{ sketch, entity }` when they picked one in a sketch; selects a face, edge or body by name for them (`null` clears) |
| | `view.get()`, `view.set({ name, overlays })` | `{ name, overlays }`; `name` is `axo`, `front`, `side` or `plan`; `overlays` a list, or `{ dims: true, grid: false }` to switch some |
| | `await look(view?, { width, height, overlays })` | draws the sheet (the last good program) to a JPEG that you receive as an image after this round's tool results; returns a line saying what was attached. `view` is `axo`, `front`, `side` or `plan` (default: the person's view); 640 × 480 px by default, at most 1600; two per step. It does not move the person's view. Look after an edit when the shape matters: engraved text, which face a hole is on, which edges a fillet took |
| | `params.list(glob?)`, `params.get(name)` | as `program.params`; one param with its provenance |
| | `params.set(name, value)`, `params.clear(name?)`, `params.overrides()` | sets an override as the Params view does (`value` in the param's unit, or text such as `'80 mm'`) and recompiles: `{ name, value, ok }`; clears one or all; the current overrides |
| | `exportFile(format, options?)` | `{ format, filename, mime, bytes, report: { kept, approximated, dropped, maxDeviation } }` for `stl`, `3mf`, `step`, `ir` or `svg`; never the bytes. With `{ save: true }` the file is also saved for the person (a download in their browser) and the result has `saved: true`; use it when they ask for a file |
| | `presets.list()`, `presets.load(id)`, `presets.current()` | `[{ id, title, group, about, mine }]`; loads a preset, replacing the open files (edits are kept per preset); the open one `{ id, title, group, about, mine, edited }` |
| | `presets.create({ title, about, files, from, open })` | a new preset of the person's, `U-01` …, under *Yours* on the shelf: `files` is `{ 'script.js': text, … }`, or `from` copies a preset (the open one with its edits); neither gives a starter part. Opens it unless `open: false`. `{ id, title, files, open }` |
| | `presets.rename(id, title)` | `{ id, title }`; only the person's own presets (`U-`, and scratch `Z-`): copy a shipped one with `from` first. Presets you create save as they are edited; only the person deletes them, on the shelf |
| helpers | `lab.open(file, lineOrFind)`, `lab.face(name)`, `lab.node(id, inView?)` (also `lab.feature`, `lab.sketch`), `lab.param(name, value?)`, `lab.view(name)`, `lab.overlay(name, on?)`, `lab.show(view)`, `lab.preset(id)`, `lab.doc(id, at?)`, `lab.book(ch, at?)`, `lab.ask(text)` | a `lab:` link target, escaped; `lab.md(text, target)` makes the Markdown link; `lab.follow(target)` follows a link for the person |
| | `console`, `log` | `console.log`, `log`, `console.warn` (`warn: …`), `console.error` (`error: …`) |

Which world a number comes from: `run()` and `program.*` describe the open program, with the Params view's overrides; `check()` compiles the files you give at the script's own values unless `options.override` says otherwise. Metrics say their fidelity: `exact` for the B-rep, `approx` for meshes and as-printed models, `heuristic` for proxies that need calibrating.

## lab: links

A Markdown link whose target starts with `lab:` drives the workbench when clicked. Escape `&` as `%26`, `#` as `%23`, `+` as `%2B`, `%` as `%25`, and parentheses beyond one balanced pair; spaces may stay.

| link | does |
|---|---|
| `lab:open?file=script.js&line=12` (or `&find=text`) | opens a file in Code at a line; `find` survives edits above it |
| `lab:face?name=body/end` | selects a face by persistent name and shows it in the view |
| `lab:node?id=shell` (optional `&in=ir`) | selects a feature, sketch or param node in the Graph (or the IR) |
| `lab:param?name=wall&value=2.4 mm` | sets a param override and recompiles; without `value`, opens it in Params |
| `lab:view?name=front`, `lab:overlay?name=dims&on=1` | sets the view: `axo`, `front`, `side`, `plan`; shows or hides an overlay (`shadows`, `grid`, `dims`, `edges`, `names`, `sketches`, `overhang`, `axes`) |
| `lab:show?view=params` | brings a view forward: `notes`, `code`, `agent`, `docs`, `book`, `reference`, `stage`, `params`, `graph`, `ir`, `trace`, `experiments` |
| `lab:preset?id=…`, `lab:build`, `lab:reset` | loads a preset; recompiles; clears the param overrides |
| `lab:doc?id=…&at=slug`, `lab:book?ch=3&at=slug` | opens a doc or a chapter of the book at a heading |
| `lab:ask?q=…` | puts a question in the agent's composer; it does not send it |
