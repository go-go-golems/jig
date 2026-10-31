# Rack and pinion

An 18-tooth pinion with a crank drives a 100 mm rack along a rail: one turn of the crank moves the rack 113.1 mm. It is the mechanism of a steering box, a drill press feed or a sliding gate, small enough to print in an afternoon. The idea it teaches: a rack is a gear of infinite radius, so the rules of a gear pair still hold, and the assembly's joints make the coupling visible.

> **Try it.** [Turn the pinion 5°](lab:param/turn=5), a quarter of a tooth: the interference check fails, tooth on tooth. Now [move the rack 1.5708 mm](lab:param/travel=1.5708), r × θ = 18 mm × 0.0873, and the gap is back. [Select the crank](lab:select/crank/side[circle]).

## How it is built

The pinion is `j.lib.gear.spur({ module: mm(2), teeth: 18, width: mm(8) })` with a Ø16 mm hub and a Ø6 mm crank peg 12 mm off the axis, bored `j.fit.hole(peg, 'free')` for its Ø5 mm axle. The rack is `j.lib.gear.rack({ module: mm(2), teeth: 16, width: mm(8) })`: straight-sided teeth at 20°, a pitch of π × 2 = 6.283 mm, 100.5 mm long, its pitch line on y = 0.

`j.inspect.gearMesh(pinion, rack)` reports the pitch-line distance, 18 mm, the pinion's pitch radius, and the travel per turn, π × m × z = 113.1 mm. The base puts the pinion's peg 18 mm from the rack's pitch line over the middle of the rack, at 7.5 pitches: a pinion with 18 teeth has a gap pointing straight down, so a rack tooth must sit right under its axis.

## The assembly

The rack is on a slider joint along X and the pinion on a revolute joint at its axle, so the assembly has 2 degrees of freedom; a gear mesh is not a joint here, so the two are coupled only by you. `.interference()` measures every gap: 0.200 mm between rack and pinion, half the 0.4 mm backlash on each flank, and 0.200 mm between each moving part and the base, because the ports sit 0.2 mm above the plate. Turn the pinion by θ without moving the rack by 18 mm × θ and the teeth collide; that is the coupling, and the check finds it.

## Rounded roots

A sharp inside corner where the peg meets the plate gathers the stress, and that corner is where a peg snaps when the pinion leans on it. `.fillet(j.feat('peg').edges().where(e => e.concave), mm(1), { id: 'peg-root' })` rounds only that edge: the peg's edges include the one where it joins the plate, and `concave` keeps the inside corner while dropping the chamfered tip. The new face is named `peg-root/face[peg/side[circle] ∩ plate/end]` after the two faces it blends, so it survives edits to either. [Find it in the graph](lab:node/peg-root).

A fillet adds material, and this one climbs 1 mm up the peg, right where the pinion's bore sits. So the bore gets a 1.2 mm lead-in chamfer on its lower edge (`lead-in`). Delete that chamfer and `.interference()` reports base and pinion overlapping. The hub is rounded into the gear the same way, at 0.8 mm. At 1 mm the fillet's rim would just touch the root of the crank, and the engine refuses the fillet and names the crank's faces.

## Printing it

All three flat: about 30 g of PLA and 81 min. The rack rides on the plate against the 6 mm rail; the pinion keeps it there. The print job is in the script; set `printJob` to `true` to compile it (slower, because slicing involute flanks is slow in this engine).

## Where next

- [M-07 Spur gear pair](lab:preset/M-07): two gears of finite radius.
- [M-10 Planetary gearbox](lab:preset/M-10): an internal gear, the inside-out case.
