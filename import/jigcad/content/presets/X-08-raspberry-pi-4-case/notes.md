# Raspberry Pi 4 case

A two-part case for a Raspberry Pi 4 Model B: a base whose four standoffs carry M2.5 heat-set inserts, and a lid with openings for every socket, vents over the processor and four tubes that press the board down. Four M2.5 screws go through the tubes and the board's holes into the inserts, so one set of screws holds all three together. Base and lid are two bodies of one part on one plate: the base as it sits, the lid upside down beside it, as it prints. The idea it teaches is splitting a case where the openings print well: at the underside of the board, every socket opening becomes a notch from an edge, so neither part needs a bridge.

> **Try it.** [Select the end of the Ethernet notch](lab:select/ethernet/side[ethernet.o.bottom]), then [give the USB end more room](lab:param/over=5) and [raise the board](lab:param/standoff=6): the openings follow the board. [Look from above](lab:view/stage?view=plan) to see the tubes over the board's holes and the vents between them.

## The board and its sockets

`pi4.json` holds the board (85 × 56 × 1.4 mm), its holes 3.5 mm in from the edges on a 58 × 49 mm rectangle, and a row per socket: its edge (`front` for the USB-C edge, `right` for the USB and Ethernet end, `left` for the SD card), its centre along that edge, its width and its height above the board. The positions are the Raspberry Pi 4 drawing's: USB-C at 11.2 mm, the micro-HDMI sockets at 26.0 and 39.5 mm, audio at 53.5 mm, and the USB stacks and Ethernet at 9.0, 27.0 and 45.75 mm up the end.

## The openings

`opening(part, p)` turns one row into one cut: a rectangle on a plane just outside the socket's wall, `gap` (1 mm) wider than the socket each side, from the split to the socket's top plus `gap`, cut inwards through the wall. The SD card, which sits under the board, gets a notch down from the top of the base instead. The script folds the whole table into the part with `reduce`, so a new row is a new opening.

The lid is drawn turned over about X and moved `lid_y` along Y, so a point (x, y, z) of the closed case is (x, `lid_y − y`, `top − z`) on the lid. `ly(y)` writes the lid's y for a board y, and `opening` measures a lid opening's heights down from `top`; that is the only difference between a cut in the base and one in the lid.

## The two parts

The base is a tray as tall as the board's underside, with `posts` on the holes and `j.hole.insert('M2.5x4')`, 3.6 × 5 mm, in each. The lid is a shell whose open side faces up on the plate; `tubes` rise from its roof to where the board's top face will be, and `screws` are M2.5 free-fit clearance holes through them, for M2.5 × 25 mm screws. `vent` is a 2.5 mm slot through the roof, patterned seven times 5 mm apart.

## Printing it

One plate, as drawn: the base upright and the lid on its roof. Every opening in the lid is a notch that opens upwards and the vent slots go through its first layers. 31.4 cm³ for both, about 40 g of PETG and 104 min. Use PETG: a Pi 4 under load keeps its case at 50 to 60 °C, where PLA starts to creep.

## Where next

- [X-07 Arduino Uno enclosure](lab:preset/X-07): a lid that presses on.
- [X-05 Project box](lab:preset/X-05): screws into inserts at the corners.
- [X-03 DIN-rail clip](lab:preset/X-03): to hang the case on a rail.
