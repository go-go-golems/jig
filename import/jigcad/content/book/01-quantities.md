---
part: I · Foundations
partAbout: Quantities, parameters and sketches: the numbers and equations a part is made of before any solid exists.
presets: A-01, D-01, C-06
docs: getting-started, reference
book: Parts from First Principles
---
# Quantities and units

A dimension in a part is never a bare number: 40 is 40 mm, 15 is 15 degrees, and a wall of "three lines" is 1.35 mm on one printer and 1.26 mm on another. This chapter shows how jig represents a quantity as a number with a dimension, why arithmetic on dimensions catches a class of mistakes at the line that makes them, and how units that belong to a printer (line widths and layer heights) stay symbolic until a printer is chosen. By the end you can read `lw(3).add(mm(0.1))` as a value, say what it becomes on a given machine, and explain why the compiler may cache it before it knows.

## 1.1 A quantity carries its dimension

A **quantity** is a number and a **dimension**: a vector of integer exponents over the base dimensions length L, mass M, time T, temperature Θ, angle and money. `mm(3)` is 3 with exponents L¹; an area has L², a density M¹L⁻³. jig stores every quantity in one canonical unit per dimension (millimetres, grams, seconds, radians, US dollars) and converts at the edges.

The exponents make two rules mechanical. **Multiplication adds exponents**: `mm(2).mul(mm(3))` is 6 mm², and a density times a volume is a mass, because M¹L⁻³ plus L³ is M¹. **Addition requires equal exponents**: a length plus an angle has no meaning, and

```js
mm(2).add(deg(3))
// DimensionError: cannot add mm (L¹) to ° (angle¹)
```

throws at the line that wrote it. Mathematically the quantities of one dimension form a vector space, and the dimensions themselves form a free abelian group under multiplication; this is what the SI Brochure's dimensional analysis amounts to, and it is the whole of what jig needs from it.

The test block below is 40 × 40 × 20 mm. Its volume is 32,000 mm³, and PLA's density is 1.24 g/cm³, so

$$
m = \rho V = 1.24\ \mathrm{g/cm^3} \times 32\ \mathrm{cm^3} = 39.68\ \mathrm{g} .
$$

The compiler gives the same 39.68 g; the mass pill in the header rounds it to 40 g. Changing the material to PETG, 1.27 g/cm³, changes the mass to 40.64 g and leaves the geometry, and its cache, untouched.

```figure
// view: axo
return j.part('block')
  .material(j.material('PLA'))
  .params({ w: mm(40), h: mm(20) })
  .extrude(j.region.rect('w', 'w'), 'h', { id: 'body' })
```

**Figure 1.1.** A 40 × 40 × 20 mm block, compiled. Its volume, 32,000 mm³, is a quantity with exponents L³; times PLA's density it gives 39.68 g.

```sketch
// title: A test block and its mass
// Change the material to 'PETG' or 'PA-CF' and read the mass pill.
return j.part('block')
  .material(j.material('PLA'))
  .params({ w: mm(40), h: mm(20) })
  .extrude(j.region.rect('w', 'w'), 'h', { id: 'body' })
```

Money works the same way. The default cost of PLA is 22 usd/kg, a quantity with exponents money¹M⁻¹, so the block's material costs 39.68 g × 22 usd/kg = 0.87 usd. Euros are money too, converted to dollars at `j.units.rates.eur`, 1.08 usd per eur by default.

## 1.2 Bare numbers and typed slots

Writing `mm(…)` around every number would make scripts unreadable, so jig lets a **slot** decide. A slot is an argument position with a declared kind: the radius of a circle is a length, the angle of a pattern is an angle, the count of a pattern is a plain number. A bare number in a length slot is millimetres; in an angle slot it is degrees, the unit people type; anywhere else it is dimensionless. So `.circle('hole', 2.2)` is a 2.2 mm radius and `j.pattern.circular(j.axis.Z, { count: 3, angle: 180 })` turns 180°.

Strings are expressions, evaluated against the part's params with units written after numbers. The socket below holds a 1/4 in hex bit. Its across-flats size is written as it would be said, a quarter inch plus 0.3 mm of clearance:

```js
.params({ af: j.q('1/4 in + 0.3 mm'), h: mm(14), d: mm(16) })
```

`j.q` parses the text, converts each term to millimetres and adds: 6.35 + 0.3 = 6.65 mm, which the Params view shows as 0.2618 in because a parsed quantity keeps the first unit it was written in for display. The value inside is 6.65 mm whatever the display.

```figure
// view: axo
const socket = j.sketch('top', { on: j.plane.offset(j.plane.XY, 'h') })
  .polygon('hex', 6, 'af / 2', { inscribed: false })
return j.part('socket')
  .params({ af: j.q('1/4 in + 0.3 mm'), h: mm(14), d: mm(16) })
  .extrude(j.region.circle('d / 2'), 'h', { id: 'body' })
  .cut(socket.profiles(), mm(10), { id: 'pocket' })
```

**Figure 1.2.** A socket for a 1/4 in hex bit: a 16 mm disc 14 mm tall with a hexagonal pocket 6.65 mm across flats and 10 mm deep. Inches and millimetres meet in one expression; the cut goes into the material because everything lies behind the sketch plane, a decision the Program records.

```sketch
// title: A hex-bit socket in mixed units
// Try af: j.q('5/16 in + 0.3 mm') for a larger bit, or a bare 7.
const socket = j.sketch('top', { on: j.plane.offset(j.plane.XY, 'h') })
  .polygon('hex', 6, 'af / 2', { inscribed: false })
return j.part('socket')
  .params({ af: j.q('1/4 in + 0.3 mm'), h: mm(14), d: mm(16) })
  .extrude(j.region.circle('d / 2'), 'h', { id: 'body' })
  .cut(socket.profiles(), mm(10), { id: 'pocket' })
```

A dimension error inside an expression is caught the same way as in code, with the column. The param `h: 'w - 3'`, where `w` is 60 mm, gives `units.dimension: 'w - 3': cannot subtract 1 (dimensionless) from mm (L¹)`. The fix is `'w - 3 mm'`.

> **Careful.** `polygon(…, { inscribed: false })` takes the **apothem**, the distance from the centre to a flat, which is why the socket passes `af / 2`. With the default, `inscribed: true`, the size is the circumradius, the distance to a corner, and a hexagon is then $2/\sqrt{3} \approx 1.155$ times wider across corners than across flats.

## 1.3 Printer units resolve late

Some sizes in a printed part are not lengths in their own right but multiples of the machine. A wall should be a whole number of extrusion lines, or the slicer fills the remainder with a thin, weak line or a gap. A floor should be a whole number of layers. jig has units for these: `lw(n)` is n line widths, `layer(n)` n layer heights, `nozzle(n)` n nozzle diameters. They are **symbolic**: `lw(3)` stays "three line widths" until a printer says how wide a line is.

The tray in Figure 1.3 has walls of `lw(3)` and a floor of `layer(5)`. Compiled for three printers:

| printer | line width | layer | wall | floor | volume | mass (PLA) |
|---|--:|--:|--:|--:|--:|--:|
| mk4 | 0.45 mm | 0.2 mm | 1.35 mm | 1.00 mm | 5,942.5 mm³ | 7.37 g |
| x1c | 0.42 mm | 0.2 mm | 1.26 mm | 1.00 mm | 5,713.6 mm³ | 7.08 g |
| generic-msla | 0.05 mm | 0.05 mm | 0.15 mm | 0.25 mm | 1,027.4 mm³ | 1.27 g |

The script does not change between rows: only `j.printer(…)` does. On the X1C the wall is three of its own 0.42 mm lines; on a resin printer, three lines are 0.15 mm, which is too thin to handle and shows why a wall in line widths suits FDM and not resin. A resin part would say `mm(1.2)`. To see the difference on your own machine, [C-06](lab:preset/C-06) prints six fins from one to four line widths thick and shows which ones the slicer fills, leaves gaps in or drops.

```figure
// view: axo
const pocket = j.sketch('pocket', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('r', 'w - 2 * wall', 'd - 2 * wall', { center: true, r: 3 })
const tray = j.part('tray')
  .params({ w: mm(60), d: mm(40), h: mm(15), wall: lw(3), floor: layer(5) })
  .extrude(j.region.rect('w', 'd', { r: 'wall + 3 mm' }), 'h', { id: 'body' })
  .cut(pocket.profiles(), 'h - floor', { id: 'pocket' })
return j.print('tray', { printer: j.printer('mk4'), parts: [tray] })
```

**Figure 1.3.** A 60 × 40 × 15 mm tray whose wall is `lw(3)` and floor `layer(5)`, in a print job for an mk4: 1.35 mm walls, a 1.00 mm floor. The outer corner radius is `wall + 3 mm`, so the inner corners stay 3 mm whatever the wall.

```sketch
// title: A tray in printer units
// Change 'mk4' to 'x1c' or 'generic-msla' and read wall and floor in Params.
const pocket = j.sketch('pocket', { on: j.plane.offset(j.plane.XY, 'h') })
  .rect('r', 'w - 2 * wall', 'd - 2 * wall', { center: true, r: 3 })
const tray = j.part('tray')
  .params({ w: mm(60), d: mm(40), h: mm(15), wall: lw(3), floor: layer(5) })
  .extrude(j.region.rect('w', 'd', { r: 'wall + 3 mm' }), 'h', { id: 'body' })
  .cut(pocket.profiles(), 'h - floor', { id: 'pocket' })
return j.print('tray', { printer: j.printer('mk4'), parts: [tray] })
```

Your own printer is an object: `j.printer({ bed: [180, 180, 180], nozzle: mm(0.6), lw: mm(0.68) })` makes `lw(3)` 2.04 mm. A part compiled without a print job resolves against `generic-fdm`, whose line is 0.45 mm and layer 0.2 mm.

## 1.4 Resolution is linear, so it can wait

A symbolic quantity is a sum of terms, each a coefficient times a unit: `lw(3).add(mm(0.1))` prints as `3lw + 0.1mm`. **Resolving** it substitutes a printer context, and the result is linear in the context's values:

$$
\operatorname{resolve}(a \cdot \mathrm{lw} + b) = a \cdot \mathrm{lw}_0 + b .
$$

With the default 0.45 mm line that is 3 × 0.45 + 0.1 = 1.45 mm; with a 0.68 mm line, 3 × 0.68 + 0.1 = 2.14 mm. Both numbers are what `.resolve({ lw })` returns.

Linearity is what makes waiting safe. Sums, differences and multiples of symbolic values stay sums of the same form, so an expression such as `'w - 2 * wall'` can be carried symbolically and resolved once, with the same result as resolving each term first. Products of two symbolic values, such as a line width times a layer height (the cross-section of one extruded line), and `min` or `max` of them, are not linear; jig keeps those **lazy**, `(2lw)·(1layer)`, and evaluates them when the context arrives. In both cases the compiler can hash a part, and cache everything that does not depend on the printer, before any printer is chosen. That is the property the quantity laws of the spec (`quantity.*`, §8) exist to justify.

The pen cup of [D-01](lab:preset/D-01) is a real use. Its wall is `lw(4)`, 1.8 mm on the generic printer, chosen so the slicer lays exactly four perimeters with no gap fill between them.

```figure
// view: axo
const cup = j.part('cup')
  .params({ d: mm(60), h: mm(40), wall: lw(4) })
  .extrude(j.region.circle('d / 2'), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
return j.print('cup', { printer: j.printer('generic-fdm'), parts: [cup] })
```

**Figure 1.4.** A 60 mm cup shelled to `lw(4)`: four extrusion lines, 1.8 mm on the generic printer. The shell offsets the floor by the same amount; the tray of Figure 1.3 sizes its wall and floor separately.

```sketch
// title: A cup four lines thick
// Make wall lw(4).add(mm(0.1)) and compare the volume pill.
const cup = j.part('cup')
  .params({ d: mm(60), h: mm(40), wall: lw(4) })
  .extrude(j.region.circle('d / 2'), 'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { id: 'shell' })
return j.print('cup', { printer: j.printer('generic-fdm'), parts: [cup] })
```

> **Try it.** [Load D-01](lab:preset/D-01), [open Params](lab:show/params) and find `wall`: its value is 1.8 mm and its raw value `4lw`.

## 1.5 Key points

- A quantity is a number with a vector of dimension exponents; multiplication adds the exponents and addition requires them to be equal.
- A dimension mistake, in code or in an expression string, is an error at the line or column that made it.
- In a typed slot a bare number is millimetres or degrees; elsewhere it is dimensionless.
- `lw`, `layer` and `nozzle` are symbolic units that a printer resolves: `lw(3)` is 1.35 mm on an mk4 and 1.26 mm on an X1C.
- Resolution is linear in the printer's values, so symbolic sizes can be combined, hashed and cached before a printer is known.
- Mass, cost and print time are quantities too, derived from volume by a material's density and price.

## Exercises

> **Exercise.** In the block of Figure 1.1, write the height as `'w / 2'` and check that the volume is unchanged. Then write it as `'w / 2 + 3'` and read the diagnostic.

> **Exercise.** Make the tray's floor `layer(5)` on a printer with 0.12 mm layers, `j.printer({ layer: mm(0.12) })`. What floor thickness do you get, and how many layers is it?

> **Exercise.** A wall of `lw(2.5)` is legal but prints badly. Explain why in terms of perimeters, and write a rule with `j.rule.custom` that warns when a wall param's raw value is not a whole number of line widths.

## Further reading

- [BIPM, The International System of Units (SI Brochure)](https://www.bipm.org/en/publications/si-brochure): the definitions of the base dimensions and of dimensional analysis that jig's quantities follow.
- [The jig reference](lab:reference): every unit constructor and quantity method, with status.
