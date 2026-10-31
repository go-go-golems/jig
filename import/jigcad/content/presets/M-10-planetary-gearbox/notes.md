# Planetary gearbox

A Ø99 mm planetary gearbox: an 18-tooth sun turned by a knob, three 18-tooth planets on a carrier, and a 54-tooth ring pressed into a base. Four turns of the knob turn the carrier once. The idea it teaches: tooth counts in a planetary set are not free. The ring must have z_sun + 2 z_planet teeth, and the planets fit evenly only when (z_sun + z_ring) / n is a whole number. The script checks both before it builds anything.

> **Try it.** [Select the knob's 45° underside](lab:select/knob/side[knob.half.2]), shaped so the sun prints standing on its teeth. [Turn the first planet back to 0°](lab:param/planet1=0) and [look from above](lab:view/stage?view=plan): its teeth now sit on the sun's. [Open the graph](lab:show/graph) to see seven parts and five joints.

## The numbers

With z_sun = 18 and z_planet = 18 the ring needs 18 + 2 × 18 = 54 teeth, and (18 + 54) / 3 = 24 is whole, so three planets fit 120° apart. With the ring held, sun in and carrier out, the ratio is 1 + z_ring / z_sun = 4. Give the sun 16 teeth and the script stops: (16 + 52) / 3 is not whole. With 15 teeth three planets fit again, (15 + 51) / 3 = 22, but `j.inspect.gearMesh` adds a message: "15 teeth (shift 0) are undercut; shift: 0.12 avoids it".

Both meshes are checked with `j.inspect.gearMesh`: sun to planet, m (z_s + z_p) / 2 = 27 mm, and planet to ring, m (z_r − z_p) / 2 = 27 mm. The script compares the two and builds the carrier with its pins on a 27 mm circle.

## How it is built

The ring is `j.lib.gear.internal({ module: mm(1.5), teeth: 54, width: mm(8.4), rim: mm(4) })`, printed as the library makes it: any boolean on a 54-tooth ring costs several seconds in this engine, so instead of joining a floor to it, the base has a 4 mm recess the ring presses into, `j.fit.hole(mm(D), 'snug')` for its Ø92.75 mm outside. The base also carries the sun's Ø5 mm axle.

The sun has a Ø10 mm hub up through the carrier and a knob turned from a polyline whose underside is a 45° cone. The carrier is a hub and three arms (one `slot` patterned three times) with Ø5 mm pins for the planets, which are bored `j.fit.hole(pin, 'free')`. A notch in one arm shows the output turning.

## The assembly

The base is grounded and the ring placed on it; sun and carrier turn on revolute joints at the base's ports, and each planet turns on a joint at a port of the carrier: 5 degrees of freedom, because gear meshes are not joints here. The sun has a tooth pointing at every planet, so each planet's joint starts at 10°, half a tooth, and the ring is turned 180° / 54 to show each planet a tooth.

`.interference()` confirms the meshes: 0.200 mm between sun and each planet, 0.180 mm between each planet and the ring, 0.350 mm round the pins, and 0 mm between ring and base, where the ring sits in its recess. It is not in the script because it takes about two minutes on 21 pairs of parts.

## Printing it

Seven parts, all flat: about 54 g of PETG and 2 h 20 min. The carrier prints arms down with `orient: '-Z'`, and the sun stands on its teeth under its 45° knob. The print job is in the script: set `printJob` to `true` to compile it; it takes about a minute, because slicing involute flanks is slow in this engine. Press the ring into the base, drop the planets on the carrier's pins, set the sun on its axle and lower the carrier over it.

## Where next

- [M-07 Spur gear pair](lab:preset/M-07): one external mesh and its centre distance.
- [M-09 Rack and pinion](lab:preset/M-09): the straight case.
