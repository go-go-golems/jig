# M10 bolt and nut

A fully threaded M10 × 25 hex bolt and an M10 nut that runs on it, printed. Neither is as strong as steel, but both are exact enough to hold a jig together, replace a lost knob bolt or show how a thread works. The idea it teaches: a thread is a library feature with a fit class. The same `j.lib.thread('M10')` grows into the bolt and cuts into the nut, each side moved by its clearance.

> **Try it.** [Select the underside of the head](lab:select/head/end), the face the thread grows from. [Make the bolt 30 mm long](lab:param/L=30) and watch the compile time: a thread costs about a second for every few turns. [Open the trace](lab:show/trace) to see where the time goes.

## How it is built

The sizes are ISO 4017 and ISO 4032 for M10 coarse: pitch 1.5 mm, 16 mm across flats, head 6.4 mm, nut 8.4 mm. A hexagon is a sketch `polygon` with 6 sides on a circle of `s / sqrt(3)`, the radius that puts the flats 16 mm apart.

The bolt is `head`, a 0.8 mm `crown` chamfer round the face that lies on the bed, then the thread placed with `at: j.frame.on(j.feat('head').endFace())`: a frame on the head's top face, so the thread starts there and runs `L` up. `tip` turns a small triangle round the axis and cuts a 45° lead-in at the end, so the first turn starts cleanly in the nut.

The nut is `body` with both faces chamfered, then the same thread with `internal: true`, placed on the top face with `{ flip: true }` so that it cuts down into the nut. The internal tool runs 0.5 mm past each face, so the thread opens cleanly at both ends.

## The fit

`j.lib.thread` takes `fit = 'slide'` by default. The bolt's crests are modelled at Ø9.6 mm (10 mm − 2 × 0.2 mm) and the nut's tool at Ø10.4 mm, so the flanks have 0.4 mm between them in all. That is loose by machine-shop standards and about right for a printed pair that has to turn by hand. With a calibrated profile ([C-01](lab:preset/C-01)) the gap follows your printer; until then the compile reports `fit.uncalibrated` as info.

## Printing it

Both parts with +Z up, the bolt on its head, in PETG: about 5 g and 22 min. A standing thread prints its flanks as stacked rings, which is why the bolt stands; laid down, the thread would need supports and come out oval. The flanks overhang 60° from vertical, and the job reports 423.1 mm² on the bolt and 158.3 mm² in the nut as info: at a 1.5 mm pitch each overhang is under a millimetre wide and prints without support.

## Where next

- [M-06 Threaded jar](lab:preset/M-06): a two-start thread you can open in one turn.
- [C-05 Hole sizes](lab:preset/C-05): how far a printed hole shrinks.
