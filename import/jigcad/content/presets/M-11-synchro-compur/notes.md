# Synchro-Compur leaf shutter

The Synchro-Compur 0-MXV is the leaf shutter of many cameras of the 1950s and 1960s. Five steel blades are pivoted round a 25 mm opening. A ring swings them open and shut, a spring-driven cam turns the ring once per exposure, and a gear train with a pallet escapement times the slow speeds. This model comes from the Compur project: 29 parts drawn in jig from the repair manual's dimensions, 118.7 g in brass, steel and aluminium, and a planar simulation of the mechanism written for them. The idea it shows: jig draws the parts, and an outside engine moves them in the Render view.

> **Try it.** [Open the Render view](lab:show/render) and play the timeline: 0.5 s at rest, one 1/125 release slowed 250 times, then 1 s at rest. [Look from the front](lab:view/stage?view=plan) to see the parts as they are drawn: the blades shut and the cam with its opening lug on the ring's stud. In `look.js`, set `CUTAWAY` to `true` to leave out the front cover, the speed ring, the speed cam and the cocking ring and watch the mechanism under them.

## How it moves

No jig study drives this preset. `tools/compur-poses.mjs` runs one release in the project's simulation (`web/sim.js`, a planar engine with springs, contacts and impacts), the release lever pressed from 2 to 4 ms, and samples it every 42 µs (24 kHz) for 20 ms. Each simulated body moves the component of the same name, by an angle about its pivot and a move of the pivot, relative to the pose the CAD is drawn in. The pallet rides on its control lever, and the cocking ring would turn with the pinion.

`compur-poses.look.js` holds 481 samples for the 17 components that move, 71 KB, and turns them into poses about jig's Z axis, the optical axis, in the CAD package's frame. `look.js` imports it as the scene's animation, so the Render view plays it like a study.

At 1/125 the blades are open from 3.9 ms to 13.3 ms. The cam turns 129°, from 3° cocked to its arrest at 13.7 ms, the blades swing up to 40°, and the train's star wheel turns about 40 times.

## How it looks

Each part carries the material its comment names: brass for the mounting tube, housing, mechanism plate, sync bridge, escapement plates, gear segment, wheels and inertia weight; aluminium for the speed ring and front cover; steel for the rest. Where the drawing's colour says a metal is coated, the script says so with `.finish()`. The housing is painted black, the blades, their plate and the diaphragm are blackened, the mechanism and escapement plates are nickel-plated and the front cover is anodised black. A bare metal ignores its display colour in a render.

## Changing it

The poses are relative to where each part is drawn. Move a part or a pivot in the script and they no longer fit: run `node tools/compur-poses.mjs <compur>/web` again, which needs the Compur project's `web/` folder. `--speed 30` bakes another speed. The 29 parts take about 20 s to compile cold; the threads and the wheels' pinions are most of it.

## Where next

[The slider-crank mechanism](lab:preset/F-06) moves by a jig study instead. [The planetary gearbox](lab:preset/M-10) is another train of wheels.
