---
id: F-05
title: Fields of time
group: Fields
about: p.time makes any field move: a scrolling pattern, a pulsing emitter, a slowly turning planet — all on the GPU.
tries: Make the pulse twice as fast|Pause the clock and scrub time with the agent
docs: architecture, gpu
---
# Fields of time

`p.time` (or `fx.time()`) is seconds since the scene started. A field that uses it is re-evaluated every frame **on the GPU**: no rebuild, no repack — the accumulation restarts because the image changed.

- the floor's stripes scroll: `fx.stripes(p.P.x.add(p.time.mul(0.2)), 3)`;
- the ring pulses: its emission is multiplied by `p.time.mul(4).sin().mul(0.5).add(0.5)`;
- the globe turns: `.rotateY(fx.time().mul(0.4))` is a transform of time, so the host re-packs only that object.

> **Try it.** Press **Pause** in the viewport: time stops and the image converges. Ask the agent to "set time to 2.5 s".
