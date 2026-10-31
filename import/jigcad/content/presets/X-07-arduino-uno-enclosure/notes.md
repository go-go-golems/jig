# Arduino Uno enclosure

A two-piece enclosure for an Arduino Uno: a base with four standoffs carrying M3 heat-set inserts on the Uno's holes, notches for its USB and power sockets, and a press-on lid with a window over each header row so jumper wires can come out. Base and lid are two bodies of one part, the lid upside down beside the base as it prints. Everything about the board is in `uno.json`. The idea it teaches is a model driven by a table through loops: one standoff per hole, one notch per socket, one window per header row.

> **Try it.** [Raise the board to 8 mm](lab:param/standoff=8) for a shield's pins underneath, then [give it more room](lab:param/clear=3). [Select the floor of the USB notch](lab:select/usb/start) and [look from above](lab:view/stage?view=plan) to see the windows over the headers.

## The table

`uno.json` holds the Uno Rev3's board (2.7 × 2.1 in, 68.58 × 53.34 mm), its four holes at (550, 100), (600, 2000), (2600, 300) and (2600, 1400) mils from the corner by the power jack, the two sockets by their centre along the edge and their size, and the two header rows. `bx` and `by` turn board coordinates into expressions in the world, with the board's centre at the origin and the board turned half a turn so the sockets face +X:

```js
const bx = x => `bl / 2 - ${x} mm`       // board x → world x
```

## The loops

- `postsAt(z)` folds the hole list into one sketch with a circle per hole. Drawn on the floor it makes `posts`, 7.5 mm across and 5 mm tall; drawn at the posts' tops it gives `inserts` its centres, `j.hole.insert('M3x4')`, a 4.0 × 5 mm hole for an M3 × 4 mm insert.
- `U.ports.forEach` cuts a notch from the rim for each socket, its width plus `gap` (1 mm) a side, down to 1 mm below the board's top face. The USB-B socket stands 6.4 mm off the board's edge, so the inside is longer on that side (`over`).
- `U.headers.forEach` cuts a 5 mm window through the lid over each header row. The lid is drawn turned over about X, so a row at y in the base is at `lid_y − y` in the lid.

## Printing it

One plate, as drawn: the base upright, the lid on its top face so its lip stands up. 33.4 cm³ for both, about 42 g of PETG and 111 min. The lid's lip is the inside of the base less 0.1 mm a side (the snug class), so it presses on; the notches are closed at the top by the lid, which makes each a window that needed no bridge to print.

## Where next

- [X-08 Raspberry Pi 4 case](lab:preset/X-08): ports cut through the walls, vents and screws.
- [X-06 Raspberry Pi Pico case](lab:preset/X-06): the same idea for a small board.
