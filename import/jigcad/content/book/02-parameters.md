---
part: I · Foundations
presets: D-03, A-01
docs: getting-started
---
# Parameters as a graph

A useful part has a handful of sizes a person would change and many more that follow from them: the width of a compartment follows from the width of the tray, the number of compartments and the wall between them. This chapter shows how jig stores those relations as a graph of named expressions, evaluates it in dependency order, records which layer of the program supplied each value, and uses the graph to recompute only what a change can reach. By the end you can read a parameter's provenance, choose a configuration, and predict which features a change will rebuild.

## 2.1 Parameters are named expressions

`.params({…})` declares **parameters**: names bound to quantities, numbers or expression strings. An expression names other parameters, so the set of parameters is a directed graph, with an edge from each name an expression mentions to the parameter that mentions it. The desk tray of [D-03](lab:preset/D-03), reduced to its essentials, has eight inputs and two derived sizes:

```js
.params({
  w: mm(160), d: mm(100), h: mm(30), wall: lw(4), floor: layer(8),
  nx: 3, ny: 2, r_in: mm(6),
  cw: '(w - (nx + 1) * wall) / nx',
  cd: '(d - (ny + 1) * wall) / ny',
})
```

`cw` depends on `w`, `nx` and `wall`; `cd` on `d`, `ny` and `wall`. The compiler sorts the graph topologically and evaluates it in **levels**: level 0 holds the parameters with no dependencies, level k those whose dependencies are all below k. Here `cw` and `cd` are at level 1. Each value is evaluated once, after everything it reads.

The Program explains every derived value in the same terms. `why('cw')` answers

```text
cw = (w − (nx + 1)·wall) / nx = (160 mm − (3 + 1)·1.8 mm) / 3 = 50.9333 mm;
nx from configs.mixed
```

which is the expression, the expression with values substituted, the result, and where the inputs that did not come from `.params` came from. The 1.8 mm is `lw(4)` resolved on the generic printer ([Chapter 1](lab:book?ch=1)).

```figure
// view: axo
// height: 280
const pockets = j.sketch('pockets', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('c', 'cw', 'cd', {
    center: true, r: 'r_in',
    at: ['-w / 2 + wall + cw / 2', '-d / 2 + wall + cd / 2'],
  })
  .pattern(['c'], j.pattern.grid(j.dir('+X'), j.dir('+Y'), {
    count: ['nx', 'ny'], step: ['cw + wall', 'cd + wall'],
  }))
return j.part('tray')
  .params({
    w: mm(160), d: mm(100), h: mm(30), wall: lw(4), floor: layer(8),
    nx: 3, ny: 2, r_in: mm(6),
    cw: '(w - (nx + 1) * wall) / nx',
    cd: '(d - (ny + 1) * wall) / ny',
  })
  .extrude(j.region.rect('w', 'd', { r: 'r_in + wall' }), 'h', { id: 'body' })
  .cut(pockets.profiles(), 'h - floor', { id: 'pocket' })
```

**Figure 2.1.** The tray at its defaults: 160 × 100 × 30 mm, three by two compartments of 50.93 × 47.30 mm, walls of 1.8 mm and a 1.6 mm floor. Nothing in the sketch is a number: every corner is an expression of the params, so the compartments follow any change to the outside size.

```sketch
// title: A tray whose compartments follow its size
// Set nx to 4 or w to 200 mm: cw follows, and so does every pocket.
const pockets = j.sketch('pockets', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('c', 'cw', 'cd', {
    center: true, r: 'r_in',
    at: ['-w / 2 + wall + cw / 2', '-d / 2 + wall + cd / 2'],
  })
  .pattern(['c'], j.pattern.grid(j.dir('+X'), j.dir('+Y'), {
    count: ['nx', 'ny'], step: ['cw + wall', 'cd + wall'],
  }))
return j.part('tray')
  .params({
    w: mm(160), d: mm(100), h: mm(30), wall: lw(4), floor: layer(8),
    nx: 3, ny: 2, r_in: mm(6),
    cw: '(w - (nx + 1) * wall) / nx',
    cd: '(d - (ny + 1) * wall) / ny',
  })
  .extrude(j.region.rect('w', 'd', { r: 'r_in + wall' }), 'h', { id: 'body' })
  .cut(pockets.profiles(), 'h - floor', { id: 'pocket' })
```

A graph that is not acyclic has no evaluation order. `.params({ wall: 'floor / 2', floor: 'wall * 2' })` asks for each of `wall` and `floor` before the other, and the compiler reports the cycle with its path and a fix instead of looping:

```text
param.cycle: wall → floor → wall
fix: give one of them a value: wall has no base value
```

A name the graph does not contain is `param.unknown`, with the column in the expression where it appears.

## 2.2 Layers, configurations and provenance

A parameter can be set in several places, and the program must say which one wins. jig stacks them in **layers**, from lowest to highest precedence: a library's default, `.params`, a row of `.configs`, `.override`, and the overrides from the Params view. A higher layer **shadows** a lower one; the lower value is kept, so the Program can show what was replaced.

A **configuration** is a named set of overrides, one row of a small table. The tray declares three:

```js
.configs({
  pens: { nx: 4, ny: 1, d: mm(80) },
  mixed: { nx: 3, ny: 2 },
  parts: { nx: 4, ny: 3, h: mm(25) },
})
```

With no `.config(…)` chosen, the middle row is active, here `mixed`: a default that lies inside the family, not at one end of it. Every value records its source:

| config | nx × ny | d | h | cw | cd | volume |
|---|---|--:|--:|--:|--:|--:|
| pens | 4 × 1 | 80 mm (shadows 100 mm) | 30 mm | 37.75 mm | 76.40 mm | 58,310.0 mm³ |
| mixed | 3 × 2 | 100 mm | 30 mm | 50.93 mm | 47.30 mm | 73,180.5 mm³ |
| parts | 4 × 3 | 100 mm | 25 mm (shadows 30 mm) | 37.75 mm | 30.93 mm | 79,472.3 mm³ |

The `parts` tray is 5 mm lower and yet uses more material. Its twelve pockets cover less floor than the six of `mixed`, 12 × 37.75 × 30.93 mm against 6 × 50.93 × 47.30 mm before the corner rounding, because two more dividers take up the difference. `why('nx')` under `mixed` reads `nx = 3; from configs.mixed`, and lists the shadowed `params` value of 3.

```figure
// view: axo
// height: 260
const pockets = j.sketch('pockets', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('c', 'cw', 'cd', {
    center: true, r: 'r_in',
    at: ['-w / 2 + wall + cw / 2', '-d / 2 + wall + cd / 2'],
  })
  .pattern(['c'], j.pattern.grid(j.dir('+X'), j.dir('+Y'), {
    count: ['nx', 'ny'], step: ['cw + wall', 'cd + wall'],
  }))
return j.part('tray')
  .params({
    w: mm(160), d: mm(100), h: mm(30), wall: lw(4), floor: layer(8),
    nx: 3, ny: 2, r_in: mm(6),
    cw: '(w - (nx + 1) * wall) / nx',
    cd: '(d - (ny + 1) * wall) / ny',
  })
  .configs({
    pens: { nx: 4, ny: 1, d: mm(80) },
    mixed: { nx: 3, ny: 2 },
    parts: { nx: 4, ny: 3, h: mm(25) },
  })
  .config('pens')
  .extrude(j.region.rect('w', 'd', { r: 'r_in + wall' }), 'h', { id: 'body' })
  .cut(pockets.profiles(), 'h - floor', { id: 'pocket' })
```

**Figure 2.2.** The same script with `.config('pens')`: four compartments 37.75 mm wide in an 80 mm deep tray. The configuration changed three inputs; the expressions did the rest.

```sketch
// title: The tray's three configurations
// Change .config('pens') to 'parts' or 'mixed', or delete the line.
const pockets = j.sketch('pockets', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('c', 'cw', 'cd', {
    center: true, r: 'r_in',
    at: ['-w / 2 + wall + cw / 2', '-d / 2 + wall + cd / 2'],
  })
  .pattern(['c'], j.pattern.grid(j.dir('+X'), j.dir('+Y'), {
    count: ['nx', 'ny'], step: ['cw + wall', 'cd + wall'],
  }))
return j.part('tray')
  .params({
    w: mm(160), d: mm(100), h: mm(30), wall: lw(4), floor: layer(8),
    nx: 3, ny: 2, r_in: mm(6),
    cw: '(w - (nx + 1) * wall) / nx',
    cd: '(d - (ny + 1) * wall) / ny',
  })
  .configs({
    pens: { nx: 4, ny: 1, d: mm(80) },
    mixed: { nx: 3, ny: 2 },
    parts: { nx: 4, ny: 3, h: mm(25) },
  })
  .config('pens')
  .extrude(j.region.rect('w', 'd', { r: 'r_in + wall' }), 'h', { id: 'body' })
  .cut(pockets.profiles(), 'h - floor', { id: 'pocket' })
```

Configurations are a finite set, which matters later: a compiler can build every row ahead of time, and a search can treat the configuration as one more discrete axis ([Chapter 10](lab:book?ch=10)). A table from a data file works the same way: [D-04](lab:preset/D-04) reads its cell sizes from `cells.csv` with `j.table(…)` and passes the result to `.configs`.

> **Try it.** [Load D-03](lab:preset/D-03), [open Params](lab:show/params) and read the source column: `nx` and `ny` come from `configs.mixed`. Then [set w to 200 mm](lab:param/w=200) and watch `cw` follow.

## 2.3 A change recomputes its downstream cone

Because the parameters form a graph and the features form a sequence, the compiler knows what each feature depends on. Each feature has a **cache key**, a hash of its type, the resolved values of the parameters it reads, the content hashes of the bodies it takes as input and the persistent names of the faces it refers to. Display names, colour and material are left out of the key: a material changes mass, not geometry. When a parameter changes, every feature whose key does not change is taken from the cache. What is recomputed is the parameter's **downstream cone**: everything reachable from it in the graph.

The box of [A-01](lab:preset/A-01) has two features: `body`, an extrude of height `h`, and `shell`, which reads `body`'s result and `wall`. Four compiles in a row, measured in Node on the build machine:

| compile | volume | body | shell | total |
|---|--:|---|---|--:|
| defaults | 15,344.27 mm³ | 62.8 ms | 282.9 ms | 512 ms |
| wall 2.5 mm | 18,836.63 mm³ | cached | 130.8 ms | 334 ms |
| wall 2.5 mm, h 40 mm | 23,511.52 mm³ | 76.6 ms | 213.9 ms | 493 ms |
| wall 2.5 mm again | 18,836.63 mm³ | cached | cached | 38 ms |

Changing `wall` cannot reach `body`, so the extrude is reused. Changing `h` reaches both. Returning to an earlier value finds both features in the cache and costs only the mesh and the bookkeeping. The trace in the workbench shows these rows for every compile.

```figure
// view: axo
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2), r: mm(3) })
  .extrude(
    j.sketch('base', { on: j.plane.XY })
      .rect('outline', 'w', 'd', { center: true, r: 'r' }).profiles(),
    'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
```

**Figure 2.3.** The box of A-01: `body` extrudes a 60 × 40 mm rounded rectangle by 30 mm, and `shell` hollows it with 2 mm walls. A change of `wall` rebuilds only `shell`; a change of `h` rebuilds both.

```sketch
// title: Which features does a change rebuild?
// Change wall, Run, and open the Trace: body is marked cached.
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30), wall: mm(2), r: mm(3) })
  .extrude(
    j.sketch('base', { on: j.plane.XY })
      .rect('outline', 'w', 'd', { center: true, r: 'r' }).profiles(),
    'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
```

The cone is also why the timeline can be edited cheaply. `.suppress(id)` replaces a feature by the identity, `.rollback(id)` stops before it, and `.insertAfter(id, b => …)` adds a feature in the middle; in each case the features before the edit keep their keys and come from the cache. In the spec's terms the timeline is a monoid under concatenation and a suppressed feature is its identity element, and those two facts are exactly what prefix caching needs.

> **Try it.** [Load A-01](lab:preset/A-01), [set wall to 2.5 mm](lab:param/wall=2.5) and [open the trace](lab:show/trace): `feature:body` is marked cached.

## 2.4 Key points

- Parameters form a directed acyclic graph of named expressions, evaluated level by level in topological order.
- A cycle is reported as an error with its path; an unknown name or a dimension error with the column where it occurs.
- Values come from layers (default, params, a configuration row, override, the Params view), and every value records the layer it came from and what it shadows.
- Configurations are a finite set of named overrides; with none chosen, the middle row is active.
- Each feature's cache key hashes what it reads, so a change recomputes only its downstream cone.
- Suppressing, rolling back or inserting a feature leaves the features before it in the cache.

## Exercises

> **Exercise.** Add a parameter `pitch: 'cw + wall'` to the tray and use it as the pattern's step. Which level is `pitch` at? Check with `why('pitch')`.

> **Exercise.** Give the tray a fourth configuration, `wide: { w: mm(220), nx: 5 }`. With four rows, which one is active when none is chosen? Check the source column in Params.

> **Exercise.** In A-01, change `r`, the corner radius, and predict which features the trace marks cached before you look.
