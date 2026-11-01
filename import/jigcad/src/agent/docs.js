// The documentation registry of the agent's eval scope (JIG-012 phase 3). One record per row of the reference's
// scope table; the table in src/agent/reference.md is rendered from here (the <!-- agent-scope --> marker), and
// help() answers from the same records, so the reference, help() and the guards' pointers cannot disagree.
// test/agent/docs.test.mjs fails when a scope name has no record or a record names nothing in the scope.
//
// A record: { names: [paths], sig: 'the call as shown', group, text: 'what it returns and does', where? }
//   names  the scope paths the row documents ('files.read', 'check'); help(path) finds the row by any of them
//   where  'sandbox' for names only the sandbox has (the language and its local check())

export const GROUPS = ['the language', 'files', 'compile', 'the program', 'queries', 'measure', 'the bench', 'helpers'];

export const SCOPE_DOCS = [
  { group: 'the language', names: ['j'], where: 'sandbox', sig: '`j`, `mm` `cm` `deg` `lw` `layer` … (the unit functions)', text: 'the language, as in scripts: try any part of it directly (`return j.fit.hole(mm(6), \'press\')`). `help(j.fit)` lists a namespace; the language reference (above) documents every name' },
  { group: 'the language', names: ['data'], where: 'sandbox', sig: '`data`', text: "the preset's data files, parsed (`data['holes.csv']`), as scripts see them" },
  { group: 'files', names: ['files.list'], sig: '`files.list()`', text: '`[{ path, lines, edited }]`, sorted' },
  { group: 'files', names: ['files.read'], sig: '`files.read(path, from?, to?)`', text: 'the whole file; with `from`, numbered lines `from` … `to` (40 lines by default)' },
  { group: 'files', names: ['files.grep'], sig: '`files.grep(pattern, path?)`', text: 'up to 80 lines `file:line  text`; a string matches literally, a RegExp as a pattern' },
  { group: 'files', names: ['files.edit'], sig: '`files.edit(path, find, replace)`', text: '`{ path, line }`; throws when `find` is missing or occurs more than once' },
  { group: 'files', names: ['files.write'], sig: '`files.write(path, text)`', text: '`{ path, lines }`; prefer `edit`' },
  { group: 'files', names: ['files.rename', 'files.remove'], sig: '`files.rename(from, to)`, `files.remove(path)`', text: '`{ from, to }`; `{ removed }`. `script.js` keeps its name and stays; a step\'s revert brings files back' },
  { group: 'compile', names: ['run'], sig: '`run()`', text: 'compiles the current files with the Params view\'s overrides and shows the result: `{ ok, ms, errors, warnings, summary }`; `errors` and `warnings` are `[{ level, kind, at, line, message, fix }]` (at most six warnings, then `{ more, see }`). Read warnings: `feature.noEffect` means a feature changed nothing, even though the program compiles' },
  { group: 'compile', names: ['check'], sig: '`check(variant?, options?)`', text: 'compiles in the sandbox, without touching the editor or the view: no `variant` compiles the current files; `variant` is the text of `script.js`, or `{ path: text }` for the files that differ; `options` (`{ override, config }`) go to the compiler. `{ ok, ms, errors, warnings, summary, metrics, program }`, metrics as plain numbers in their units; `program` is live (`program.faces(\'%plane\')`, `program.why(…)`, `program.measure.face(…)`, the `program.*` reads below) until the next `check()`' },
  { group: 'the program', names: ['program.summary'], sig: '`program.summary()`', text: '`{ ok, kind, name, features, bodies, sketches, dof, faces, volume, … }` of the last compile' },
  { group: 'the program', names: ['program.metrics'], sig: '`program.metrics(names?)`', text: '`{ volume: { value, unit, fidelity }, mass: …, … }`' },
  { group: 'the program', names: ['program.diagnostics'], sig: '`program.diagnostics(level?)`', text: '`[{ level, kind, at, line, message, fix }]`' },
  { group: 'the program', names: ['program.params'], sig: '`program.params(glob?)`', text: '`[{ name, value, unit, text, expr, src, deps, range }]`; `glob` such as `\'gap.*\'`' },
  { group: 'the program', names: ['program.trace', 'program.decisions'], sig: '`program.trace()`, `program.decisions()`', text: 'compile passes `{ pass, level, ms, cached, note }`; choices `{ at, kind, chose, alternatives, reason }`' },
  { group: 'the program', names: ['program.graph'], sig: '`program.graph()`', text: '`{ nodes: [{ id, kind, level }], edges: [\'base → body profile\', …] }`' },
  { group: 'the program', names: ['program.ir'], sig: '`program.ir(level, { node?, from?, to? })`', text: 'the text of IR level `L0` … `L6`, for one node, or numbered lines' },
  { group: 'the program', names: ['program.bodies', 'program.print'], sig: '`program.bodies()`, `program.print()`', text: '`[{ id, part, faces, edges, bbox }]`; plates, orientation, overhang and layers of a print job' },
  { group: 'queries', names: ['why'], sig: '`why(target)`', text: 'resolved names, the genealogy chain and why each candidate was kept or dropped; `target` is selector text, `\'param:wall\'` or `\'feature:shell\'`' },
  { group: 'queries', names: ['faces'], sig: '`faces(selectorText)`', text: '`[{ name, kind, area, center, normal, radius }]` for a query such as `\'>Z\'` or `\'%cylinder\'`' },
  { group: 'queries', names: ['feature', 'sketch'], sig: '`feature(id)`, `sketch(id)`', text: 'a feature\'s record (inputs, outputs, cache key); a sketch\'s `{ dof, status, conflicts, entities, constraints }`' },
  { group: 'measure', names: ['measure.face', 'measure.edge'], sig: '`measure.face(name)`, `measure.edge(name)`', text: '`{ name, body, kind, area, center, normal, axis }`; `{ name, kind, length, faces }`, in world coordinates' },
  { group: 'measure', names: ['measure.distance', 'measure.angle'], sig: '`measure.distance(a, b)`, `measure.angle(a, b)`', text: '`{ distance, unit, how }` between faces, edges or points `[x, y, z]` (parallel planes and axes exactly, otherwise between centres); `{ angle, unit: \'°\' }` between normals, axes or directions' },
  { group: 'measure', names: ['measure.bbox', 'measure.area'], sig: '`measure.bbox(body?)`, `measure.area(names or selector)`', text: '`{ min, max, size }` in mm; `{ area, unit, faces }`' },
  { group: 'the bench', names: ['selection', 'select'], sig: '`selection()`, `select(name)`', text: 'the person\'s selection `{ name, body, face, edge }`, or `{ sketch, constraint }` / `{ sketch, entity }` when they picked one in a sketch; selects a face, edge or body by name for them (`null` clears)' },
  { group: 'the bench', names: ['view.get', 'view.set'], sig: '`view.get()`, `view.set({ name, overlays, sketches })`', text: '`{ name, overlays, sketches }`; `name` is `axo`, `front`, `side` or `plan`; `overlays` a list, or `{ dims: true, grid: false }` to switch some; `sketches` the sketch ids drawn on the part in those views (`[]` hides them; `look()` draws them too)' },
  { group: 'the bench', names: ['look'], sig: '`await look(view?, { width, height, overlays })`', text: 'draws the sheet (the last good program) to a JPEG that you receive as an image after this round\'s tool results; returns a line saying what was attached. `view` is `axo`, `front`, `side` or `plan` (default: the person\'s view); 640 × 480 px by default, at most 1600; two per step. It does not move the person\'s view. Look after an edit when the shape matters: engraved text, which face a hole is on, which edges a fillet took. A drawing does not show depth or hidden faces: an imprint and an engraving look the same from the front, so confirm depth with the volume and the warnings' },
  { group: 'the bench', names: ['params.list', 'params.get'], sig: '`params.list(glob?)`, `params.get(name)`', text: 'as `program.params`; one param with its provenance' },
  { group: 'the bench', names: ['params.set', 'params.clear', 'params.overrides'], sig: '`params.set(name, value)`, `params.clear(name?)`, `params.overrides()`', text: 'sets an override as the Params view does (`value` in the param\'s unit, or text such as `\'80 mm\'`) and recompiles: `{ name, value, ok }`; clears one or all; the current overrides' },
  { group: 'the bench', names: ['exportFile'], sig: '`exportFile(format, options?)`', text: '`{ format, filename, mime, bytes, report: { kept, approximated, dropped, maxDeviation } }` for `stl`, `3mf`, `step`, `ir` or `svg`; never the bytes. With `{ save: true }` the file is also saved for the person (a download in their browser) and the result has `saved: true`; use it when they ask for a file' },
  { group: 'the bench', names: ['presets.list', 'presets.load', 'presets.current'], sig: '`presets.list()`, `presets.load(id)`, `presets.current()`', text: '`[{ id, title, group, about, mine }]`; loads a preset, replacing the open files (edits are kept per preset); the open one `{ id, title, group, about, mine, edited }`' },
  { group: 'the bench', names: ['presets.create'], sig: '`presets.create({ title, about, files, from, open })`', text: 'a new preset of the person\'s, `U-01` …, under *Yours* on the shelf: `files` is `{ \'script.js\': text, … }`, or `from` copies a preset (the open one with its edits); neither gives a starter part. Opens it unless `open: false`. `{ id, title, files, open }`' },
  { group: 'the bench', names: ['presets.rename'], sig: '`presets.rename(id, title)`', text: '`{ id, title }`; only the person\'s own presets (`U-`, and scratch `Z-`): copy a shipped one with `from` first. Presets you create save as they are edited; only the person deletes them, on the shelf' },
  { group: 'helpers', names: ['lab.open', 'lab.face', 'lab.node', 'lab.feature', 'lab.sketch', 'lab.param', 'lab.view', 'lab.overlay', 'lab.show', 'lab.preset', 'lab.doc', 'lab.book', 'lab.ask', 'lab.md', 'lab.follow'], sig: '`lab.open(file, lineOrFind)`, `lab.face(name)`, `lab.node(id, inView?)` (also `lab.feature`, `lab.sketch`), `lab.param(name, value?)`, `lab.view(name)`, `lab.overlay(name, on?)`, `lab.show(view)`, `lab.preset(id)`, `lab.doc(id, at?)`, `lab.book(ch, at?)`, `lab.ask(text)`', text: 'a `lab:` link target, escaped; `lab.md(text, target)` makes the Markdown link; `lab.follow(target)` follows a link for the person' },
  { group: 'helpers', names: ['help'], sig: '`help(x?)`', text: 'what a name or value is: `help()` lists this scope; `help(\'files.read\')` or `help(files.read)` gives its row; `help(j.fit)` lists a namespace of the language; `help(part)` the methods of a value. Text, so `return help(…)`' },
  { group: 'helpers', names: ['console', 'log'], sig: '`console`, `log`', text: '`console.log`, `log`, `console.warn` (`warn: …`), `console.error` (`error: …`)' },
];

const byName = new Map();
for (const r of SCOPE_DOCS) for (const n of r.names) byName.set(n, r);

/** The record documenting a scope path ('files.read'), or null. */
export const scopeDoc = path => byName.get(path) ?? null;
/** Every documented scope path. */
export const scopeNames = () => [...byName.keys()];

/** The reference's scope table, rendered (markdown). */
export function scopeTable() {
  const rows = ['| group | name | returns |', '|---|---|---|'];
  let last = null;
  for (const g of GROUPS) for (const r of SCOPE_DOCS.filter(x => x.group === g)) {
    rows.push(`| ${g === last ? '' : g} | ${r.sig} | ${r.text}${r.where === 'sandbox' ? ' (sandbox)' : ''} |`);
    last = g;
  }
  return rows.join('\n');
}

export const SCOPE_MARKER = '<!-- agent-scope -->';
/** The lab reference with its scope table rendered in. */
export const renderReference = md => md.replace(SCOPE_MARKER, scopeTable());
