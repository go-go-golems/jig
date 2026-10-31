# Threaded jar

A Ø64 mm jar about 70 mm tall, roughly 140 ml, and a fluted screw lid that goes from first bite to closed in a turn and a quarter. The idea it teaches: a thread with more than one start. The neck and the lid share one spec, Ø56 mm with a 4 mm pitch and two starts: two teeth wound side by side, so each turn advances 8 mm instead of 4.

> **Try it.** [Look at it from the front](lab:view/stage?view=front): the two thread starts climb the neck side by side. [Select the jar's shoulder](lab:select/body/side[section.outline.3]) and then [open the trace](lab:show/trace) to see the thread features, the slowest in the compile.

## How it is built

The jar is one turned outline: a 50 mm straight body of radius 32 mm, a shoulder that steps in 6.4 mm while it rises 7.7 mm, and a 12 mm neck. `walls` hollows it with a 2 mm shell open at the top. The shoulder rises at 50° rather than 45° because after the shell its inside faces down, and 40° from vertical prints where exactly 45° is a coin toss.

`j.lib.thread(spec, { length: mm(10), starts: 2 })` is placed 1.5 mm above the shoulder. A thread is a solid rod with teeth, so `mouth` bores the neck out again afterwards. The neck's outside, 25.6 mm, sits just inside the thread's root, so the rod and the neck fuse into one body.

The lid is a disc with a Ø52.2 mm bore and the same thread with `internal: true`, placed on the rim with a frame whose z points down into the lid. Its skirt is 11 mm deep: the neck's top seats against the lid's ceiling, and the skirt stops 1 mm short of the shoulder. Twenty-four Ø3.2 mm flutes, one sketch circle and a circular pattern, give your fingers something to turn.

## The fit

The default `slide` class moves each side 0.2 mm: the neck's crests are Ø55.6 mm, the lid's thread tool Ø56.4 mm. On 60° flanks each part's flank moves back 0.1 mm, so mating flanks are 0.2 mm apart: enough for PETG to turn without binding. The profile is ISO (60°) rather than trapezoidal because its flanks are 60° from vertical when the jar stands: each layer steps out 0.35 mm, which prints, where a 30° trapezoid would step 0.75 mm.

## Printing it

Both upright, the lid on its top: about 66 g of PETG and 3 h. The job reports the thread flanks as overhang info (1211.0 mm² on the jar, 1117.6 mm² in the lid); they print without supports. A thread costs about 5 s to compile on a busy machine; the second compile reuses it from the cache.

## Where next

- [M-02 M10 bolt and nut](lab:preset/M-02): a single-start ISO thread.
- [C-01 Fit coupon](lab:preset/C-01): calibrate `slide` before you print a big thread.
