# Raspberry Pi Pico case

A small case for a Raspberry Pi Pico: a tray with four M2 standoffs that the board screws onto, a notch in one end for its micro-USB socket, a notch in the other for wires, and a lid that presses on with a lip. The board's numbers live in `pico.json`. The idea it teaches is building a case outwards from the board: every size of the tray is the board plus a clearance plus a wall, and the lid's lip is the inside of the tray less a fit-class gap. Tray and lid are two bodies of one part, so every param reaches both.

> **Try it.** [Raise the board to 6 mm](lab:param/standoff=6) for wires underneath, then [loosen the lid](lab:param/gap=0.2). [Select the floor of the USB notch](lab:select/usb/start) and [look from the side](lab:view/stage?view=side).

## The board

`pico.json` holds the datasheet's numbers: a 51 × 21 × 1 mm board, four 2.1 mm holes 47 mm apart along it and 11.4 mm across, and a micro-USB socket 8 mm wide and 2.6 mm tall at one end. The script reads them into `P`, so `hx` and `hy`, half the hole spacings, place the standoffs.

## The tray

The inside is the board plus `clear` (1 mm) all round, the outside that plus `wall` (`lw(4)`, 1.8 mm). `posts` is a sketch with one circle and a mirror pattern of it across both axes; it is extruded from the floor by `standoff` and, drawn again at the posts' tops, gives the hole feature its four centres: `j.hole.tapped('M2', { depth: 'standoff' })` is 1.9 mm, so M2 × 6 mm screws cut their own thread. The USB notch is cut down from the rim to 0.5 mm below the board's top face, the wire notch to the board's top face.

## The lid

The lid is drawn as it prints: upside down, `lid_y` along Y from the tray, its top on the bed. Its lip is a rectangle with a rectangular hole, the inside of the tray less `gap` (0.1 mm, the snug class) on each side and 1.2 mm thick, standing 3 mm up from the plate. In use it goes 3 mm down into the tray, and the tray's height leaves 3.9 mm above the USB socket, so the lip clears it.

## Printing it

One plate, as drawn: 8.4 cm³ for both, about 11 g of PETG and 30 min. If the lid is too tight, raise `gap` by 0.05 mm at a time; it is the only number that sets the press fit.

## Where next

- [X-07 Arduino Uno enclosure](lab:preset/X-07): ports from a table, cut through the walls.
- [X-05 Project box](lab:preset/X-05): a lid held by screws instead.
