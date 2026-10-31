# Dovetail tray

An 80 × 60 × 30 mm desk tray with a dovetail tail on one end and a dovetail socket on the other. Every module is the same part, so you print as many as you like and slide them together into a row: pens in one, clips in the next. The idea it teaches: tail and socket are one library feature. `j.lib.dovetail` adds the tail as modelled and cuts the socket wider by the fit gap, so the two always match.

> **Try it.** [Look at it from above](lab:view/stage?view=plan): the tail on the right, the socket on the left. [Select a flank of the socket](lab:select/socket/side[flankL]) and read the fit in the inspector. Then [thin the side walls to 1.2 mm](lab:param/side=1.2).

## How it is built

`body` is a rounded 80 × 60 mm rectangle extruded 30 mm; `pocket` cuts the inside from the top down to the floor, leaving `side` walls (`lw(4)`, 1.8 mm) and 8 mm `end` walls. The end walls are thick because the socket goes 5.2 mm into one of them.

Both dovetails are placed with `j.frame({ origin, x, z })`. Its z is the face's outward normal (+X for the tail, −X for the socket) and its x is chosen so that its y points up, the direction the dovetail runs in. That makes each dovetail a prism standing on the bed: no overhangs, and the modules slide together vertically.

```js
.add(dovetail, { at: tailAt, op: 'join', id: 'tail' })
.add(dovetail, { at: socketAt, op: 'cut', id: 'socket' })
```

The tail is 14 mm wide at the root, 5 mm deep and widens at 15°. The socket comes out 14.40 × 5.20 mm: 0.2 mm per flank, the `slide` class.

## Checking the fit

Two modules placed end to end in an assembly with `.interference()` (try it with the agent) report a minimum gap of 0 mm, because the end faces meet. Move the second one 0.05 mm away and the gap is 0.050 mm: the tail sits inside the socket without touching it. A 0.4 mm chamfer round every bed edge keeps elephant's foot from jamming the joint and gives the tail a lead-in.

## Printing it

The job prints two modules, upright and without supports: about 76 g of PLA and 200 min. Print one first and try the joint between it and a module from the second print; if it is stiff, calibrate the slide class with [C-01](lab:preset/C-01).

## Where next

- [M-04 Snap-fit battery cover](lab:preset/M-04): a joint that clicks shut.
- [D-03 Desk tray](lab:preset/D-03): a tray with dividers.
