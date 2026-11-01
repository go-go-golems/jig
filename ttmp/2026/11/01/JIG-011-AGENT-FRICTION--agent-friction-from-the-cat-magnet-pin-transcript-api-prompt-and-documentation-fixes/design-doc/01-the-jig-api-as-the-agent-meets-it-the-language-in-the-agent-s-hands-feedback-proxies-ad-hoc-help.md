---
Title: 'The jig API as the agent meets it: the language in the agent''s hands, feedback proxies, ad-hoc help'
Ticket: JIG-011-AGENT-FRICTION
Status: active
Topics:
    - agent
    - api
    - docs
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Across 517 recorded agent runs, 35% hit an API-misuse error; j is not defined (73) and mm is not defined (39) lead. Design: the language in the agent's hands through a worker-side jig() evaluator, guard proxies that turn a wrong name into the list of right ones, help() from one doc registry that also generates the reference, argument contracts that name the call, self-describing values, and consistent result shapes. Compared with the Form Skate workbench's evaluator."
LastUpdated: 2026-11-01T17:08:01.911586089-05:00
WhatFor: ""
WhenToUse: ""
---

# The jig API as the agent meets it

The Cat magnet pin analysis (`analysis/01-…`) listed fixes to scripts, prompts and documentation. This document is
about the API itself, the `j` namespace and the lab scope, as a model meets it: what it can reach, what happens
when it guesses a name, and how it finds out what exists. It compares jigcad with the Form Skate workbench
(`~/Downloads/form-skate-workbench-full.zip`, read in an isolated folder; nothing from it was run).

## 1. Evidence: how often the API trips the agent

All 11 recorded run files (517 runs, 2,697 eval steps, JIG-003 to JIG-009):

| Error in a step result | Count | What the agent wanted |
|---|---|---|
| `ReferenceError: j is not defined` | 73 | to call the language in an eval step |
| `ReferenceError: mm is not defined` | 39 | the same, for units |
| `… is not a function` from an unawaited promise | 83 | (JIG-004 already explains these in the result) |
| `Cannot read properties of undefined (reading 'volume')` | 15 | `r.metrics.volume` after a failed check, or the wrong shape |
| `b.faces.map / .filter / .slice is not a function` | 9 | `program.bodies()` gives `faces` as a count; the reference's prose says "faces and edges with persistent names" |
| `r.warnings.map is not a function` | 3 | warnings were a count before JIG-009 |

182 of the 517 runs (35 %) hit at least one of these. The largest group is not a mistake in the model's knowledge of
jig: it is the model trying to use jig where jig is not, 112 times.

## 2. What Form Skate does differently

Form Skate's agent panel is the ancestor of jigcad's (same eval tool, YAML results, modes, revert). Its lab scope
(`app/host.js` `labScope`) differs in what it puts in reach:

| Form Skate | jigcad today |
|---|---|
| `FORM`, `V`, `Q`: the framework itself, in the eval scope | `j`, `mm` absent: the engine runs in a Web Worker |
| `game`, `world`: the live runtime; `read`, `trace`, `step`, `advance` | `program.*`: snapshots of the last compile |
| `test({ script, files })` → structured result in a fresh headless world | `check(variant)`: the same idea |
| `experiment(name)`: sweeps defined in `experiments.js` return rows | `j.design / search / evaluate` exist in the language (`src/engine/explore.js`) but the agent is not told; it hand-rolled loops of `check()` |
| `describe(id)`, `query(fn)`, `inspect(glob)` over the compiled program | `why(name)`, `program.graph()`, `faces(selector)` |
| every builder call stamps `srcHere()` | `callsite.js` `stampLine`: the same |

jigcad's evaluator is the more developed one in other respects (promise tracking, images, look(), warnings as
text, Ask-mode approval before each step). What Form Skate has and jigcad lacks is the language in the agent's
hands. Neither has a help system or guard proxies; those are new.

## 3. Design

### 3.1 The language in the agent's hands: `jig(code)`

The engine, OpenCascade included, lives in the worker. Loading a second engine on the main thread costs memory
and start-up time and splits state. Instead, a worker op evaluates a snippet with the language in scope:

```js
await jig(`return j.fit.hole(mm(6), 'press')`)
// → 6.2 mm   (j.fit.hole(6, press): 6 + 2 × 0.05 + hole compensation 0.1)

await jig(`return j.region.circle(mm(22)).union(j.region.polygon([[-8, 19], [-19, 9], [-17, 35]]))`)
// → region: 1 outline, area 1,612.4 mm², bbox 44 × 57.2 mm

await jig(`const m = j.lib.magnet({ d: mm(6), h: mm(3) }); return help(m)`)
// → lib.magnet(d, h, { fit }) · a pocket from its placement point going +z … (see 3.3)
```

- Scope: `j`, the unit functions, `data`, and the open program's params as values (`p.w`), so `p.w / 2` works.
- The value comes back described (3.5), plus `logs` from `log`/`console.log` in the snippet.
- The same capture serves `check()` and `run()`: a script's `log(…)` output returns as `logs` (analysis T2), so the
  agent no longer encodes answers in a bounding box or a thrown error.
- `j` and `mm` in the eval scope become guards rather than missing names: touching them throws
  "`j` runs in the engine, not in this step: `await jig(\`return j.fit.hole(mm(6), 'press')\`)`". That turns the
  112 ReferenceErrors into an instruction with an example.

### 3.2 Guard proxies: a wrong name lists the right ones

jigcad already does this twice: `j.load` and `j.field` are Proxies whose every member throws a sentence. Extend
the idea to every namespace, in scripts and in the lab:

```js
j.fit.holeComp(6)
// TypeError: j.fit has no "holeComp". j.fit: classes, gap, hole, pin, coupon, profileRegister.
//            Hole compensation is part of j.fit.hole(d, class). help('fit')

program.metric('mass')
// TypeError: program has no "metric"; did you mean "metrics"? program: summary, metrics, params, diagnostics, …
```

- A guard is a `get` trap on a frozen namespace object: a known key passes through untouched; an unknown string key
  throws with the member list, the nearest names (edit distance ≤ 2) and, where one exists, a sentence about the
  concept the name points at (`holeComp` → "part of j.fit.hole"). Symbols and `then` pass through, so `await` and
  the YAML printer are unaffected.
- Builders (Part, Sketch, Print, Assembly) get the same for methods: `.filet(…)` → "Part has no method "filet"; did
  you mean "fillet"?". Builders are immutable and made by a handful of factories, so the factories return a guarded
  instance. `instanceof`, hashing and cache keys see the target; this must be measured on compile time (many
  builder calls per compile) before it is kept.
- The lab objects (`program`, `files`, `presets`, `measure`, `view`) get the same guard.

### 3.3 Ad-hoc help from one registry

One registry of documentation records, attached to the API functions themselves:

```js
doc(fit.hole, {
  sig: 'j.fit.hole(d, class)',
  args: { d: 'length: number (mm), mm(…), or a param name inside a feature', class: 'press | snug | slide | free | printInPlace' },
  returns: 'a fit-dependent length: d + 2 × the class gap + hole compensation',
  where: 'features and regions; in .params() write \'md + 2 * gap.press\'',
  example: ".hole([[0, 0]], j.hole.simple(j.fit.hole('md', 'press'), 'mh'))",
  see: ['fit.gap', 'hole.simple', 'lib.magnet'],
});
```

- `help(x)` accepts a function, a namespace, a builder, a value or a dotted name. A namespace lists its members with
  one line each; a builder lists its methods and its current features; a value says what it is and what it
  accepts.
- In scripts `help(…)` returns text (shown through `log`); in the lab `help()` with no argument lists the eval
  scope, and `help('look')` returns that row of the reference.
- The guards (3.2) and contract errors (3.4) end with `help('…')`, so one wrong guess leads to the documentation for
  exactly that call.
- The reference tables the model reads are generated from the same registry, so the documentation and the API cannot
  drift. This also fixes the prose/row mismatch on `program.bodies()`.

### 3.4 Argument contracts that name the call

Errors today often surface far from the call (`mm(…) takes a number, got NaN` for `j.fit.hole('md', 'press')` in
`.params()`). A small contract helper checks arguments at the API boundary and names the call, the argument and
the accepted forms:

```text
j.fit.hole(d, class): d is the param name 'md', which has no value while params are being defined.
In .params() write 'md + 2 * gap.press' (+ hole compensation 0.1 mm); inside a feature j.fit.hole('md', 'press') works.
help('fit.hole')
```

Lengths accept the same forms everywhere (number in mm, a quantity, a param name, an expression string), or the
contract says which form a position does not take.

### 3.5 Values that describe themselves

A Quantity prints as `6.2 mm`, a Region as `region: 1 outline, area …, bbox …`, a Part as
`part cat-magnet-pin: body (extrude) · foot (chamfer) · face (cut) · magnet (hole)`, a Selector as the query and its
match count. The YAML printer calls a `describe()` method when a value has one. Builders currently print as their
internal records, which tells the model nothing.

### 3.6 One shape for one thing

- `check().summary` and `program.summary()` have the same fields (`name` and `kind` are missing from `check`).
- `program.metrics()` returns `{ value, unit, fidelity }` and `check().metrics` plain numbers. Keep one default
  (plain numbers, units in the reference) and ask for detail explicitly: `program.metrics({ detail: true })`.
- `program.bodies()` names its counts `faceCount`, `edgeCount`, or returns the names (capped); not a count called
  `faces`.

### 3.7 Library and language fixes found on the way

- One direction for library cutters: into the surface from the placement point (`j.lib.magnet` goes up today,
  `j.lib.dowel` down).
- `gap.<class>` in expressions documented; `j.design / search / evaluate` named in the reference with an example of a
  sweep, which is what the agent asked for as `check.matrix`.

## 4. What I would not port

Form Skate's `game`/`world` live runtime fits a simulation; a CAD program is a compile, and jigcad's `program.*`
snapshots plus `check()` cover the same need. `experiment(name)` reading a file is less direct than `j.design`,
which jigcad already has.

## 5. Measurement

- The misuse count of §1, per run, before and after: 35 % of runs today. Target classes: `j`/`mm` not defined,
  wrong member names, wrong shapes.
- A probe-heavy case built from the Cat magnet transcript ("create a configurable magnet pin preset") and a case
  that needs a fit value ("make the magnet pocket a press fit for a 6 × 3 mm magnet"): steps, time, tokens.
- Compile time of the presets with guarded builders, before and after (3.2 is kept only if the cost is small).
- The full set, both tiers, for regressions.

## 6. Order

1. `jig(code)` with described values and script logs; `j`/`mm` guards in the eval scope (3.1, 3.5).
2. Guards on namespaces and lab objects; contracts on the calls the transcripts hit (fit, lib, hole, region) (3.2, 3.4).
3. The doc registry and `help()`, starting with those namespaces; generate the reference rows from it (3.3).
4. Shapes (3.6) and library fixes (3.7).
5. Builder guards, if the compile-time cost is small.

Each step is measured with the cases of §5 before the next.
