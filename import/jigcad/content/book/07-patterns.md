---
part: II · Solids
presets: S-03, D-01, D-03
docs: reference
---
# Symmetry and patterns

Six bosses round a hub, twelve holes in a grid, nineteen pockets in a coaster: most repetition in a part is a symmetry applied to one feature. This chapter treats a pattern as what it is mathematically, a group of transformations acting on a feature, and shows what that buys: the number of instances is known before any geometry exists, two patterns combine by multiplying their counts, and instances that coincide merge instead of failing. By the end you can write a pattern as a product of simpler ones, count its instances by hand, and avoid the off-by-one that open circular patterns invite.

## 7.1 A pattern is a group acting on a feature

A **pattern** is a set of transformations, and patterning a feature applies each of them to the feature's tool (its profile, its hole, its boss) and combines the results with the part. For a circular pattern of $n$ instances about an axis the transformations are the rotations by $k \cdot 360°/n$ for $k = 0, \ldots, n - 1$. They form the cyclic group $C_n$: composing two rotations of the set gives another rotation of the set, the rotation by 0° is the identity, and every rotation has an inverse in the set. The feature's copies are its **orbit** under the group.

`j.pattern.circular(j.axis.Z, { count: 6 })` is $C_6$. Its instances are known from the pattern alone, before the part is compiled: `count` is 6, `closed` is true because the angles cover a full turn, and expanding it at the point (20, 0, 0) gives the six centres

| k | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| centre | (20, 0) | (10, 17.32) | (−10, 17.32) | (−20, 0) | (−10, −17.32) | (10, −17.32) |

which is $20(\cos 60°k, \sin 60°k)$. A pattern of a feature **replays** the feature: `.pattern(j.feat('boss'), …)` builds the boss's tool once more at each transformed position and joins it, so each copy is a real boss with its own named faces, `bosses[1]/boss/end` to `bosses[5]/boss/end` beside the original `boss/end`.

```figure
// view: axo
return j.part('hub')
  .extrude(j.region.circle(30), mm(5), { id: 'disc' })
  .extrude(j.sketch('b', { on: j.feat('disc').endFace() })
    .circle('c', 4, { at: [20, 0] }).profiles(), mm(6), { id: 'boss' })
  .pattern(j.feat('boss'), j.pattern.circular(j.axis.Z, { count: 6 }),
    { id: 'bosses' })
```

**Figure 7.1.** A 60 mm hub 5 mm thick with one 8 mm boss at radius 20 mm, patterned by $C_6$. Volume: the disc's 14,137.17 mm³ plus six bosses of 301.59 mm³ each, 15,946.72 mm³.

```sketch
// title: A circular pattern of a feature
// Change count to 5 or 8; the volume grows by one boss per instance.
return j.part('hub')
  .extrude(j.region.circle(30), mm(5), { id: 'disc' })
  .extrude(j.sketch('b', { on: j.feat('disc').endFace() })
    .circle('c', 4, { at: [20, 0] }).profiles(), mm(6), { id: 'boss' })
  .pattern(j.feat('boss'), j.pattern.circular(j.axis.Z, { count: 6 }),
    { id: 'bosses' })
```

The same patterns act on sketch entities. `.pattern(['h1'], …)` inside a sketch copies the circle `h1` and names the copies `h1.p1`, `h1.p2`, …, so a single profile carries every hole and one extrude cuts them all, as in the plate of [Chapter 4](lab:book?ch=4).

## 7.2 Products multiply counts

Two patterns combine by `.times`: every transformation of the first composed with every transformation of the second. For groups this is the **direct product**, and its size is the product of the sizes:

$$
|G \times H| = |G| \cdot |H| .
$$

A row of 4 holes 15 mm apart times a column of 3 is a 4 × 3 grid of 12, and the count is 12 before anything is built. The plate below is 70 × 55 × 3 mm with 12 holes of 6 mm. Each hole is a through-hole, so the genus is 12, which the Euler–Poincaré check of [Chapter 5](lab:book?ch=5) confirms: $V = 40$, $E = 60$, $F = 22$, $L = 46$, $S = 1$ give $G = 1 - \tfrac{1}{2}(40 - 60 + 22 - 24) = 12$.

```figure
// view: plan
const across = j.pattern.linear(j.dir('+X'), { count: 4, step: mm(15) })
const deep = j.pattern.linear(j.dir('+Y'), { count: 3, step: mm(15) })
const holes = j.sketch('h', { on: j.plane.XY })
  .rect('r', 70, 55, { center: true, r: 4 })
  .circle('c', 3, { at: [-22.5, -15] })
  .pattern(['c'], across.times(deep))
return j.part('plate').extrude(holes.profiles(), mm(3), { id: 'body' })
```

**Figure 7.2.** A 70 × 55 × 3 mm plate, plan: one 6 mm hole and the product of a 4-instance row and a 3-instance column, 12 holes, genus 12. Volume $(3850 - 13.73 - 12 \cdot 9\pi) \times 3 = 10{,}490.92$ mm³.

```sketch
// title: A grid as a product of two rows
// Replace deep by j.pattern.mirror(j.axis.X): how many holes now?
const across = j.pattern.linear(j.dir('+X'), { count: 4, step: mm(15) })
const deep = j.pattern.linear(j.dir('+Y'), { count: 3, step: mm(15) })
const holes = j.sketch('h', { on: j.plane.XY })
  .rect('r', 70, 55, { center: true, r: 4 })
  .circle('c', 3, { at: [-22.5, -15] })
  .pattern(['c'], across.times(deep))
return j.part('plate').extrude(holes.profiles(), mm(3), { id: 'body' })
```

A **mirror** is a group of two elements, the identity and the reflection, and the reflection is an **involution**: mirroring twice is the identity. That law has a visible consequence. `mx.times(mx)`, a mirror composed with itself, has four transformations, but only two distinct ones; expanded, it reports `count 2, total 4, deduped 2` and the decision `pattern.dedupe: 2 coincident instances removed`. Coincident instances merge rather than being cut or joined twice. Mirrors across two perpendicular axes, on the other hand, do not collapse: `j.pattern.mirror(j.axis.X).times(j.pattern.mirror(j.axis.Y))` is the four-element Klein group and puts a hole in each corner of the plate of Figure 4.1.

## 7.3 Lattices and filters

A **lattice** pattern repeats a cell over the plane. `j.pattern.hex(plane, { pitch, rings })` places cells on a triangular lattice, the arrangement whose cells are hexagons; with $r$ rings round the centre it has

$$
1 + 6 + 12 + \ldots + 6r = 1 + 3r(r + 1)
$$

instances: 37 for 3 rings. A lattice rarely fits a part's outline, so patterns take a **filter**, a predicate on each instance that sees its position and the part's params. Filtering the hex lattice of 10 mm pitch to centres within 20 mm of the origin keeps 19 of the 37, rings 0 to 2.

The coaster of [S-03](lab:preset/S-03) uses both. Its pockets are hexagons of circumradius `cell` (8 mm) on a lattice of pitch $\sqrt{3}\cdot\text{cell} + \text{web}$, rotated 30° so that neighbouring pockets face each other flat to flat across a web of `lw(3)`. The filter keeps a pocket only if its farthest corner stays inside the rim:

```js
.filter((c, { scope }) => Math.hypot(c.at.x, c.at.y)
  + scope.cell.value <= scope.d.value / 2 - scope.rim.value)
```

For a 90 mm coaster with a 4 mm rim, 19 pockets pass. The pocket cut makes 19 × 7 faces (six walls and a floor each), and the part has 136 faces in all. The filter reads the params through `scope`, so a larger diameter admits more pockets without any change to the pattern.

```figure
// view: plan
const lattice = j.frame({ origin: j.origin, z: j.dir('+Z'),
  x: j.dir(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0) })
const corner = k => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]
const hexagon = [0, 1, 2, 3, 4, 5].map(k => corner(k))
  .map(([c, s]) => [`cell * ${c.toFixed(6)}`, `cell * ${s.toFixed(6)}`])
const pitch = 'cell * sqrt(3) + web'
const cells = j.sketch('cells', { on: j.feat('body').endFace() })
  .polyline('cell', hexagon, { closed: true })
  .pattern(['cell'], j.pattern.hex(lattice, { pitch, rings: 3 })
    .filter((c, { scope }) => Math.hypot(c.at.x, c.at.y)
      + scope.cell.value <= scope.d.value / 2 - scope.rim.value))
return j.part('coaster')
  .params({ d: mm(90), t: mm(4), depth: mm(1.6), cell: mm(8),
    web: lw(3), rim: mm(4) })
  .extrude(j.region.circle('d / 2'), 't', { id: 'body' })
  .cut(cells.profiles(), 'depth', { id: 'pockets' })
```

**Figure 7.3.** A 90 mm coaster in plan: a hex lattice of 37 cells filtered to the 19 whose corners stay 4 mm inside the rim, cut 1.6 mm deep. Pockets 16 mm across corners, webs of `lw(3)` = 1.35 mm.

```sketch
// title: A filtered hex lattice
// Set d to 120 mm: the same filter admits more pockets. Try rim: mm(10).
const lattice = j.frame({ origin: j.origin, z: j.dir('+Z'),
  x: j.dir(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0) })
const corner = k => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]
const hexagon = [0, 1, 2, 3, 4, 5].map(k => corner(k))
  .map(([c, s]) => [`cell * ${c.toFixed(6)}`, `cell * ${s.toFixed(6)}`])
const pitch = 'cell * sqrt(3) + web'
const cells = j.sketch('cells', { on: j.feat('body').endFace() })
  .polyline('cell', hexagon, { closed: true })
  .pattern(['cell'], j.pattern.hex(lattice, { pitch, rings: 3 })
    .filter((c, { scope }) => Math.hypot(c.at.x, c.at.y)
      + scope.cell.value <= scope.d.value / 2 - scope.rim.value))
return j.part('coaster')
  .params({ d: mm(90), t: mm(4), depth: mm(1.6), cell: mm(8),
    web: lw(3), rim: mm(4) })
  .extrude(j.region.circle('d / 2'), 't', { id: 'body' })
  .cut(cells.profiles(), 'depth', { id: 'pockets' })
```

> **Careful.** The pattern's `rings` bounds the lattice before filtering, so it must be large enough for the largest diameter you expect. With 3 rings at the coaster's 15.21 mm pitch, no cell centre lies more than 45.6 mm from the middle, so a larger coaster would get no new pockets; the preset computes `rings` from `d` for that reason.

## 7.4 Open and closed circular patterns

A circular pattern over a full turn is **closed**: its last step returns to the first instance, so the step is $360°/n$. Over a partial angle $\theta$ it is **open**, and both ends are instances, so the step is $\theta/(n - 1)$. Three instances over 120° are at 0°, 60° and 120°; three over 180° are at 0°, 90° and 180°.

The difference decides the pen cup of [D-01](lab:preset/D-01). Its window is cut straight through the hexagonal cup with `{ symmetric: … }`, so one cut makes two windows on opposite flats, and the cut is symmetric under a half turn. To put a window on each of the six flats, the cut must be repeated at 60° and 120°: count 3 over 120°. Written as count 3 over 180°, the instances fall at 0°, 90° and 180°. The one at 180° coincides with the original and removes nothing; the one at 90° cuts through two corners of the hexagon instead of two flats. The two scripts compile to 38,965.40 mm³ with six windows, and 41,949.97 mm³ with two windows on flats and two on corners.

```figure
// view: axo
// height: 320
const window = j.sketch('win', { on: j.plane.XZ })
  .polyline('w', [
    [0, 'sill'], ['win_w / 2', 'sill + win_w / 2'],
    ['win_w / 2', 'h - lintel - win_w / 2'], [0, 'h - lintel'],
    ['-win_w / 2', 'h - lintel - win_w / 2'],
    ['-win_w / 2', 'sill + win_w / 2'],
  ], { closed: true })
const hex = j.sketch('base', { on: j.plane.XY })
  .polygon('hex', 6, 'af / 2', { inscribed: false })
return j.part('pen-cup')
  .params({ af: mm(70), h: mm(100), wall: lw(4), win_w: mm(14),
    sill: mm(12), lintel: mm(12) })
  .extrude(hex.profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
  .cut(window.profiles(), { symmetric: 'af + 10 mm' }, { id: 'window' })
  .pattern(j.feat('window'),
    j.pattern.circular(j.axis.Z, { count: 3, angle: deg(120) }),
    { id: 'windows' })
```

**Figure 7.4.** A hexagonal cup 70 mm across flats and 100 mm tall, shelled to `lw(4)`, with one through-cut repeated at 0°, 60° and 120°: six pointed windows, one per flat. The 45° points top and bottom print without support ([Chapter 8](lab:book?ch=8)).

```sketch
// title: Open and closed circular patterns
// Change angle to deg(180) and count the windows; then try count: 6 alone.
const window = j.sketch('win', { on: j.plane.XZ })
  .polyline('w', [
    [0, 'sill'], ['win_w / 2', 'sill + win_w / 2'],
    ['win_w / 2', 'h - lintel - win_w / 2'], [0, 'h - lintel'],
    ['-win_w / 2', 'h - lintel - win_w / 2'],
    ['-win_w / 2', 'sill + win_w / 2'],
  ], { closed: true })
const hex = j.sketch('base', { on: j.plane.XY })
  .polygon('hex', 6, 'af / 2', { inscribed: false })
return j.part('pen-cup')
  .params({ af: mm(70), h: mm(100), wall: lw(4), win_w: mm(14),
    sill: mm(12), lintel: mm(12) })
  .extrude(hex.profiles(), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
  .cut(window.profiles(), { symmetric: 'af + 10 mm' }, { id: 'window' })
  .pattern(j.feat('window'),
    j.pattern.circular(j.axis.Z, { count: 3, angle: deg(120) }),
    { id: 'windows' })
```

The symmetry argument also says which patterns are equivalent. The cut has the symmetry of a half turn, so $C_6$ acting on it has orbits of size 3: `count: 6` over a full turn makes the same six windows, with three of its six instances coinciding with others. Count 3 over 120° is the smaller description of the same set.

## 7.5 Key points

- A pattern is a group of transformations acting on a feature's tool; the copies are the feature's orbit.
- A pattern's instance count and transforms are known before any geometry is built.
- `.times` forms the product of two patterns, and the counts multiply: 4 × 3 = 12.
- A mirror is an involution, so a mirror times itself collapses to two instances, and the compiler merges coincident instances with a `pattern.dedupe` decision.
- A hex lattice of $r$ rings has $1 + 3r(r + 1)$ cells; a filter on position and params cuts it to the part's outline.
- A closed circular pattern steps by $360°/n$; an open one by $\theta/(n - 1)$, so count 3 over 180° means 0°, 90°, 180°.

## Exercises

> **Exercise.** Write the hub's six bosses as a product of a half-turn pattern and a three-instance pattern. Which two patterns, and does the volume match Figure 7.1?

> **Exercise.** In the coaster, how many pockets pass the filter for $d$ = 120 mm? Predict it from the ring geometry before compiling.

> **Exercise.** [D-03](lab:preset/D-03) uses `j.pattern.grid` for its pockets. Rewrite it as a product of two linear patterns and check that the pockets' names do not change.

## Further reading

- [The reference: patterns](lab:reference): every pattern constructor and operation, with status.
