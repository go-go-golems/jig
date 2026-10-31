# Project box

A 90 × 60 × 35 mm box for a small circuit, with a 3 mm lid held by four M3 countersunk screws in heat-set inserts and a hole in one end for a PG7 cable gland. The box and the lid are two bodies of one part, laid out side by side as they print. The idea it teaches is keeping two pieces consistent by building them from the same params and the same list of corners, so the screws in the lid always land on the inserts in the box.

> **Try it.** [Make it 120 mm wide](lab:param/W=120) and watch the bosses and the screws move together, then [make it 50 mm tall](lab:param/H=50). [Select the gland hole](lab:select/gland/bore[1]) and [set it for a PG9 gland](lab:param/gland=15.2).

## The box

`body` is a rounded block and `shell` hollows it with the top open; the walls and the floor are `lw(5)`, five line widths or 2.25 mm. In each inside corner, `boss1` to `boss4` add `j.lib.insert('M3x5.7').boss({ wall: 'boss_wall', height: 'H - wall' })`: a column from the floor to the rim, 6.7 mm across, with the insert's 4.0 × 6.7 mm hole at its top. Each boss is placed at `j.pt(± bx, ± by, 'wall')`, where `bx` and `by` put it against both walls so it joins them and stiffens the corner.

`gland` is `j.hole.simple(j.fit.hole('gland', 'free'))`, 12.5 mm for a PG7 thread plus the free gap, drilled through the right-hand end only (`depth: 'wall + 1 mm'`). It is horizontal, so the print job makes it a teardrop.

## The lid

`lid` is a second body, extruded from the same outline `lid_y` = `D + 8 mm` along Y, so it lies beside the box at any size. Its four `j.hole.countersink('M3', { fit: 'free' })` holes use the same `corners`, shifted by `lid_y`, so they sit over the four inserts. `edge` chamfers the lid's top outline by 1 mm; the selector subtracts the screws' edges so only the outline is touched. Because box and lid are one part, a change in Params reaches both; two parts in a print job would each get their own copy of every param.

## Printing it

One plate, both bodies as they sit: the box on its floor and the lid on its underside, so the countersinks open upwards. 52.7 cm³ for the two, about 64 g of PETG and 167 min. Press the inserts in with a soldering iron at about 220 °C before fitting the circuit; M3 × 8 mm screws hold the lid.

## Where next

- [X-06 Raspberry Pi Pico case](lab:preset/X-06): a box built round a board.
- [W-08 Spacer and standoff set](lab:preset/W-08): standoffs for the board inside.
