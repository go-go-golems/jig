# Screw-top jar

A 300 ml jar with a screw lid, for coffee beans, tea, sugar or screws on the workbench. The neck carries a two-start trapezoidal thread, Ø64 × 4 mm, and the lid the matching internal thread, so the lid goes on in about a turn and a quarter from either start. The idea it teaches is threads from the library, and a fit that sizes both halves of a pair from one nominal size.

> **Try it.** [Look at it from the front](lab:view/stage?view=front) to see the two thread starts. Then [make a taller jar](lab:param/jar.H=120), [make it wider](lab:param/jar.D=80), or [select the neck's bore](lab:select/neck/bore). The lid fits either, because it only depends on the thread.

## How it is built

`NECK` is the thread's nominal size, `{ d: 64, pitch: 4 }`, and `thread(o)` wraps `j.lib.thread(NECK, { profile: 'trapezoid', starts: 2, fit: 'slide', … })`, so the neck and the lid can only be made from the same size. The external thread is added on the jar's shoulder with `bore: 'bore'`, a hollow threaded tube 10 mm long; the internal one is added inside the lid with `internal: true`, which cuts instead of adding. The slide class shrinks the neck to Ø63.6 and grows the lid's thread to Ø64.4, 0.4 mm of clearance across.

`body` is a 70 mm cylinder; `cavity` revolves the half-section `inside` with `op: 'cut'`: the floor, the wall, and a shoulder that rises 1.3 for every 1 inward to the neck's bore, steep enough to print without support. The lid is a 16-sided prism, a grip with no extra features, modelled beside the jar at `lid_x` so the two do not overlap on screen.

## Printing it

The jar upright and the lid on its top, both on one plate: 85,035 mm³, 106 g of PETG and about 4 h 50 min. The check reports the threads' flanks, about 1,000 mm² on each part, as overhangs: a trapezoidal flank is 75° from vertical, but it is only 2 mm deep and each turn rests on the one below, so printed threads come out clean without support. Leave supports off for this job.

The threads are the slow part of the compile, a few seconds each the first time; after that they are cached, and a change to `H` or `D` does not rebuild them.

> **Exercise.** Make a spice-sized jar on the same thread: `D` of 68 mm and `H` of 50 mm. The lid stays the same, so one lid fits every jar of the set.

## Where next

[H-09 Measuring scoop](lab:preset/H-09) checks a capacity by compiling the inside as a solid; try it on this jar. [S-05 Bag clip](lab:preset/S-05) uses the slide class for a sliding fit.
