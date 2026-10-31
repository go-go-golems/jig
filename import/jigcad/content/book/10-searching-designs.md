---
part: IV · Design process
partAbout: A model is a function of its parameters; searching it is choosing a point, and the compiler's structure makes that cheap.
presets: E-01, A-06
docs: reference
---
# Searching designs

A parametric part is a function from its parameters to a solid, and once a solid has a mass, a print time and a load it can carry, choosing the parameters is an optimisation. This chapter treats design that way: a design space as a product of parameter ranges, objectives and requirements as orders on the compiled points, and search as the choice of which points to compile. It also shows why the compiler's structure makes search cheap: requirements that depend only on parameters filter points before compiling, the feature cache makes revisited points nearly free, and closed forms answer some questions with no compile at all. By the end you can write a design space, state what you want from it, and read a search result.

## 10.1 A design space is a product

The wall hook of [E-01](lab:preset/E-01) is three extrudes: a back plate against the wall, an arm, and an upturned tip. Written as a function of the arm's thickness $t$ and the hook's width $b$, it is a **model function** `hook(t, b)`. A **design space** gives each parameter a range and pairs the ranges with the function:

```js
j.design({
  t: j.param.range(mm(4), mm(8), { step: mm(1), default: mm(6) }),
  b: j.param.range(mm(15), mm(25), { step: mm(5), default: mm(20) }),
}, p => hook(p.t.value, p.b.value))
```

The space is the product of the ranges: with the steps given, 5 values of $t$ times 3 of $b$, 15 points. A script that returns a design compiles to its default point, so the figure below is `hook(6, 20)`: the profile is 540 mm², 20 mm wide, so 10,800 mm³ and 13.39 g of PLA. The Experiments view offers to search any script that returns a design.

```figure
// view: front
const hook = (t, b) => {
  const back = j.sketch('back', { on: j.plane.XZ })
    .rect('r', t, 50, { at: [0, 0] })
  const arm = j.sketch('arm', { on: j.plane.XZ })
    .rect('r', 40, t, { at: [0, 0] })
  const tip = j.sketch('tip', { on: j.plane.XZ })
    .rect('r', t, 12, { at: [40 - t, 0] })
  return j.part('hook').material(j.material('PLA'))
    .extrude(back.profiles(), b, { id: 'back' })
    .extrude(arm.profiles(), b, { id: 'arm' })
    .extrude(tip.profiles(), b, { id: 'tip' })
}
return j.design({
  t: j.param.range(mm(4), mm(8), { step: mm(1), default: mm(6) }),
  b: j.param.range(mm(15), mm(25), { step: mm(5), default: mm(20) }),
}, p => hook(p.t.value, p.b.value))
```

**Figure 10.1.** The hook's design space at its default point, $t$ = 6 mm and $b$ = 20 mm, front elevation: a 50 mm back, a 40 mm arm and a 12 mm tip. 10,800 mm³, 13.39 g.

```sketch
// title: A design space
// Open it, then run "Search the design space" in Experiments.
const hook = (t, b) => {
  const back = j.sketch('back', { on: j.plane.XZ })
    .rect('r', t, 50, { at: [0, 0] })
  const arm = j.sketch('arm', { on: j.plane.XZ })
    .rect('r', 40, t, { at: [0, 0] })
  const tip = j.sketch('tip', { on: j.plane.XZ })
    .rect('r', t, 12, { at: [40 - t, 0] })
  return j.part('hook').material(j.material('PLA'))
    .extrude(back.profiles(), b, { id: 'back' })
    .extrude(arm.profiles(), b, { id: 'arm' })
    .extrude(tip.profiles(), b, { id: 'tip' })
}
return j.design({
  t: j.param.range(mm(4), mm(8), { step: mm(1), default: mm(6) }),
  b: j.param.range(mm(15), mm(25), { step: mm(5), default: mm(20) }),
}, p => hook(p.t.value, p.b.value))
```

A design space can also have discrete axes, `j.param.choice([...])` and `j.param.int(lo, hi)`, and a configuration table ([Chapter 2](lab:book?ch=2)) is one such axis already written.

## 10.2 Objectives and requirements

An **objective** orders the compiled points. `j.objective.minimize('mass')` ranks by one metric. Several metrics combine in one of three ways, and they answer different questions:

- **Weighted**: $\sum_i w_i m_i$, a single score; the weights say how many grams one minute of print time is worth.
- **Lexicographic**: compare by the first metric, and use the next only to break ties. The orientation of [Chapter 8](lab:book?ch=8) is chosen this way.
- **Pareto**: keep every point that no other point beats on all metrics at once, and leave the choice among them to a person. In this build `j.objective.pareto` ranks lexicographically; the front is not computed yet.

A **requirement** is different: it rules points out. The hook must carry 100 N at the end of its 40 mm arm. A full analysis would need a finite-element model of an anisotropic print, which jig leaves out; E-01 uses the beam proxy instead. The arm's section is $b \times t$, its section modulus $Z = bt^2/6$, and with an allowable stress along the layers of 50 MPa the load it carries at the tip is

$$
F = \frac{\sigma Z}{L} = \frac{50 \cdot bt^2/6}{40} \ge 100\ \mathrm{N} ⇔ bt^2 \ge 480\ \mathrm{mm^3} .
$$

The requirement depends only on the parameters, so it can be checked before compiling. `space.where(p => p.b.value * p.t.value ** 2 >= 480)` drops 4 of the 15 points without building them. Minimising mass over all 15 points picks $t$ = 4, $b$ = 15 at 6.99 g, which carries 50 N. Over the 11 feasible points the best is

| rank | t | b | $bt^2$ | load | mass |
|--:|--:|--:|--:|--:|--:|
| 1 | 6 mm | 15 mm | 540 mm³ | 112.5 N | 10.044 g |
| 2 | 5 mm | 20 mm | 500 mm³ | 104.2 N | 11.408 g |
| 3 | 7 mm | 15 mm | 735 mm³ | 153.1 N | 11.458 g |

The winner is the thicker, narrower arm. Load grows with $t^2$ and mass with $t$, so for a beam in bending thickness is the cheaper way to buy strength; the search finds what the section modulus predicts.

```figure
// view: front
const hook = (t, b) => {
  const back = j.sketch('back', { on: j.plane.XZ })
    .rect('r', t, 50, { at: [0, 0] })
  const arm = j.sketch('arm', { on: j.plane.XZ })
    .rect('r', 40, t, { at: [0, 0] })
  const tip = j.sketch('tip', { on: j.plane.XZ })
    .rect('r', t, 12, { at: [40 - t, 0] })
  return j.part('hook').material(j.material('PLA'))
    .extrude(back.profiles(), b, { id: 'back' })
    .extrude(arm.profiles(), b, { id: 'arm' })
    .extrude(tip.profiles(), b, { id: 'tip' })
}
return hook(6, 15)
```

**Figure 10.2.** The lightest hook that carries 100 N in the grid: $t$ = 6 mm, $b$ = 15 mm, 10.044 g, with a beam-proxy capacity of 112.5 N.

```sketch
// title: Search the hook, then show the best
// The grid runs when the script compiles: 15 points, 11 of them built.
const hook = (t, b) => {
  const back = j.sketch('back', { on: j.plane.XZ })
    .rect('r', t, 50, { at: [0, 0] })
  const arm = j.sketch('arm', { on: j.plane.XZ })
    .rect('r', 40, t, { at: [0, 0] })
  const tip = j.sketch('tip', { on: j.plane.XZ })
    .rect('r', t, 12, { at: [40 - t, 0] })
  return j.part('hook').material(j.material('PLA'))
    .extrude(back.profiles(), b, { id: 'back' })
    .extrude(arm.profiles(), b, { id: 'arm' })
    .extrude(tip.profiles(), b, { id: 'tip' })
}
const space = j.design({
  t: j.param.range(mm(4), mm(8), { step: mm(1) }),
  b: j.param.range(mm(15), mm(25), { step: mm(5) }),
}, p => hook(p.t.value, p.b.value))
const strong = space.where(p => p.b.value * p.t.value ** 2 >= 480)
const r = await j.search.grid(strong,
  { objective: j.objective.minimize('mass') })
return space.at(r.best.point)
```

## 10.3 Which points to compile

A **grid** search compiles every combination of the steps, so its cost is the product of the step counts, and it grows exponentially with the number of parameters: five steps on six parameters is 15,625 compiles. A **random** search draws points uniformly from the ranges with a seed, so a budget fixes the cost whatever the dimension. With a budget of 12 and seed 3, the feasibility filter kept 9 points and the best was $t$ = 5.71 mm, $b$ = 16.12 mm at 10.337 g: off the grid, and not as light as the grid's best, because nine points cover the feasible boundary sparsely.

**Latin hypercube sampling** (McKay, Beckman and Conover, 1979) sits between the two. It divides each parameter's range into $n$ equal intervals and draws $n$ points so that each interval of each parameter holds exactly one, which spreads a small budget evenly along every axis. In this build `j.search.lhs` draws the same uniform samples as `random`; the stratification is not implemented yet.

Whatever the strategy, the compiler's cache ([Chapter 2](lab:book?ch=2)) is shared across the search. In Node, the 15 cold compiles of the full grid took 7.46 s; searching the 11 feasible points straight after took 4.7 ms, every feature found in the cache. A search that revisits points, or that varies one parameter downstream of others, pays only for what changed.

```figure
// view: front
const hook = (t, b) => {
  const back = j.sketch('back', { on: j.plane.XZ })
    .rect('r', t, 50, { at: [0, 0] })
  const arm = j.sketch('arm', { on: j.plane.XZ })
    .rect('r', 40, t, { at: [0, 0] })
  const tip = j.sketch('tip', { on: j.plane.XZ })
    .rect('r', t, 12, { at: [40 - t, 0] })
  return j.part('hook').material(j.material('PLA'))
    .extrude(back.profiles(), b, { id: 'back' })
    .extrude(arm.profiles(), b, { id: 'arm' })
    .extrude(tip.profiles(), b, { id: 'tip' })
}
return hook(5.71, 16.12)
```

**Figure 10.3.** The best of a random search with a budget of 12, rounded to $t$ = 5.71 mm and $b$ = 16.12 mm: 8,337.5 mm³, 10.34 g. It satisfies $bt^2 \ge 480$ with 525.6 mm³ but is heavier than the grid's best, which a finer search would approach.

```sketch
// title: Random search with a budget
// Change budget and seed; compare the best mass with the grid's 10.044 g.
const hook = (t, b) => {
  const back = j.sketch('back', { on: j.plane.XZ })
    .rect('r', t, 50, { at: [0, 0] })
  const arm = j.sketch('arm', { on: j.plane.XZ })
    .rect('r', 40, t, { at: [0, 0] })
  const tip = j.sketch('tip', { on: j.plane.XZ })
    .rect('r', t, 12, { at: [40 - t, 0] })
  return j.part('hook').material(j.material('PLA'))
    .extrude(back.profiles(), b, { id: 'back' })
    .extrude(arm.profiles(), b, { id: 'arm' })
    .extrude(tip.profiles(), b, { id: 'tip' })
}
const space = j.design({
  t: j.param.range(mm(4), mm(8)),
  b: j.param.range(mm(15), mm(25)),
}, p => hook(p.t.value, p.b.value))
const strong = space.where(p => p.b.value * p.t.value ** 2 >= 480)
const r = await j.search.random(strong,
  { budget: 12, seed: 3, objective: j.objective.minimize('mass') })
return space.at(r.best.point)
```

## 10.4 Closed forms need no search

Some questions have answers that need no search at all. The mass of an extrude is $\rho A h$ ([Chapter 4](lab:book?ch=4)): linear in $h$. `j.stage(design)` finds such dependence and returns it as a **residual**, a function evaluated without compiling. For a 40 × 30 mm plate in PLA with $h$ in a range, it compiles at two heights and reports

```text
mass is linear in h (Cavalieri); geometry compiled at h = 4 and 5
slope 1.488 g/mm, intercept 0 g
```

and `residual.mass(7)` is 10.416 g. The slope is $\rho A = 1.24\ \mathrm{g/cm^3} \times 1200\ \mathrm{mm^2} = 1.488$ g/mm, and the intercept 0 to within $2 \times 10^{-15}$ g. The staging rule of the spec generalises this: known pure work is compiled and cached; finite unknowns, such as configurations or standard sizes, are tabulated; continuous unknowns get a residual where a closed form exists.

```figure
// view: axo
return j.design({
  h: j.param.range(mm(2), mm(10), { default: mm(4) }),
}, p => j.part('plate').material(j.material('PLA'))
  .extrude(j.region.rect(40, 30), p.h, { id: 'body' }))
```

**Figure 10.4.** A 40 × 30 mm plate whose height is a range from 2 to 10 mm, at its default of 4 mm. Its mass at any height is $1.488\,h$ g, read off two compiles.

```sketch
// title: A design with a closed form
// In the agent: j.stage(design).residual.mass(mm(7)) gives 10.416 g.
return j.design({
  h: j.param.range(mm(2), mm(10), { default: mm(4) }),
}, p => j.part('plate').material(j.material('PLA'))
  .extrude(j.region.rect(40, 30), p.h, { id: 'body' }))
```

## 10.5 Laws keep the search honest

A search trusts thousands of compiles it never looks at, so the compiler must be right in ways no single compile shows. jig states those ways as **laws**, property tests over random inputs, each with what it pays for:

| law | checks | pays for |
|---|---|---|
| `extrude.volume` | $V = Ah$ | the closed form for mass in staging |
| `revolve.volume` | $V = \thetar̄ A$ | a kernel test of revolve |
| `brep.eulerPoincare` | $V - E + F - (L - F) - 2(S - G) = 0$ | catching an invalid solid after a boolean |
| `compile.deterministic` | the same model hashes the same | caching, and reproducible search |
| `shape.boolean` | inclusion–exclusion on volume | rewriting chains of booleans |

`j.laws.check(j.laws.suite, { n: 8, seed: 1 })` runs each law on 8 generated inputs; in this build all five pass. Heuristics such as the 45° overhang rule or the fit classes are not laws: they are calibrated, and a law that encoded them would only test the calibration. Determinism is the law a search depends on most. Every random strategy takes a seed, so a search run twice gives the same points, the same compiles and the same best.

```sketch
// title: Run the laws in a compile
// A failing law throws, so the compile fails with its name.
const results = j.laws.check(j.laws.suite, { n: 4, seed: 1 })
const failed = results.filter(r => !r.ok)
if (failed.length) {
  throw new Error(`laws failed: ${failed.map(r => r.law).join(', ')}`)
}
return j.part('passed').extrude(j.region.rect(20, 20), mm(2), { id: 'body' })
```

## 10.6 Key points

- A design space pairs parameter ranges with a model function; a script that returns one compiles to its default point.
- Objectives order compiled points: weighted sums, lexicographic tie-breaks, or Pareto fronts (not yet computed in this build).
- A requirement that depends only on parameters filters points before compiling; the hook's 100 N becomes $bt^2 \ge 480$ mm³.
- For a beam in bending, load grows with $t^2$ and mass with $t$, so the search prefers the thick, narrow arm.
- Grid search costs the product of the steps; random search costs its budget; Latin hypercube sampling spreads a budget evenly but is not stratified yet in this build.
- The feature cache is shared across a search, so revisited points cost milliseconds.
- Where the metric is linear in a parameter, staging returns a closed form and no search is needed.
- Laws (`extrude.volume`, `brep.eulerPoincare`, `compile.deterministic`, …) are what make thousands of unseen compiles trustworthy.

## Exercises

> **Exercise.** Change the requirement to 150 N. What is the new constraint on $bt^2$, which grid point wins, and does the ranking still favour thickness?

> **Exercise.** Write a weighted objective that values one gram as much as one minute of print time, for the hook in a print job. Does the best point change?

> **Exercise.** Use `j.stage` on a design whose range parameter is the hook's width $b$. Is the mass linear in $b$? Is it linear in $t$, and what would `j.stage` have to do differently if it were not?

## Further reading

- McKay, Beckman and Conover, *A comparison of three methods for selecting values of input variables in the analysis of output from a computer code*, Technometrics 21(2), 1979: Latin hypercube sampling.
- [E-01 Search a wall hook](lab:preset/E-01): the same search as a preset, with its results in Experiments.
