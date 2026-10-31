# Memory-card holder

A desk block for eight SD cards and twelve microSD cards, each standing in its own slot with its name engraved in front of its column. The idea it teaches is a layout driven by a table: `cards.csv` has one row per card format, the script makes one column per row, and the block's width and depth are expressions the script writes from the table.

> **Try it.** [Loosen the slots to 0.4 mm a side](lab:param/gap=0.4), then [hold less of each card](lab:param/hold=0.35) and watch the block get lower. [Open the params](lab:show/params) to read the expressions for `W` and `D`. [Select the front face](lab:select/body/side[base.r.bottom]) and [look from above](lab:view/stage?view=plan).

## The table

```text
card,label,w,t,h,count
SD,SD,24,2.1,32,8
microSD,µSD,11,1,15,12
```

Sizes are the SD Association's: an SD card is 32 × 24 × 2.1 mm, a microSD card 15 × 11 × 1.0 mm. A card stands on its short edge `w`, so `h` is its height in the slot. Add a row for another format (miniSD is 21.5 × 20 × 1.4 mm) and the block gains a column.

## Expressions written from the table

The script joins the rows into parameter expressions, so the sizes still show in Params and still follow `gap` and `wall`:

```js
W: `${sum(r => `${r.w} mm`)} + ${2 * n} * gap + ${n + 1} * wall`,
D: `max(${lengthOf.join(', ')}) + label + wall`,
```

With the two rows above, `W` is 24 mm + 11 mm + 4 × 0.25 mm + 3 × 4 mm = 48 mm, and `D` is the longer column (twelve microSD slots, 45.5 mm) plus the 9 mm label band and a 4 mm wall: 58.5 mm.

## How it is built

`body` is a rounded block, `W` × `D` × `H`, where `H` holds the tallest card to `hold` of its height plus a 1.6 mm floor. For each row, `slots-<card>` is one slot `w + 2 · gap` by `t + 2 · gap` and a linear pattern of it along +Y, cut down by `hold · h`: 16 mm for SD and 7.5 mm for microSD. `name-<card>` engraves the label 0.6 mm deep in the band in front, centred on its column. The engraving goes on `j.feat('body').endFace().largest()`: the island inside an engraved D is also part of the top face, so the selector picks the big one.

## Printing it

Upright: 39.5 cm³ solid, about 30 g of PLA with 15 % infill and 79 min. The slots are vertical, so the 2.5 mm webs between cards print as plain walls; the 1.5 mm microSD slots are three line widths wide and come out clean with a 0.4 mm nozzle.

## Where next

- [D-05 Hex-bit holder](lab:preset/D-05): pockets from a standard and a per-flat gap.
- [D-04 Battery holder](lab:preset/D-04): a table turned into configurations.
- [D-10 Gridfinity bin](lab:preset/D-10): bins sized from a table of grid units.
