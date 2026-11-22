---
id: V-01
title: Fog and god rays
group: Media
about: Sunlight through three windows into a hazy room: single scattering in a homogeneous medium makes the beams visible.
tries: Make the haze thicker|Lower the sun so the beams reach the far wall|Set g to 0 and compare
docs: media, monte-carlo
focus: params
---
# Fog and god rays

The air in this room is a **homogeneous medium**: a scattering coefficient $\sigma_s$ and absorption $\sigma_a$ that together set the mean free path $1/\sigma_t$, plus a **phase function** for the direction of scattering. Henyey–Greenstein with $g = 0.7$ scatters mostly forward, so the beams are brightest when you look toward the sun.

The path tracer samples a free-flight distance in the medium; at each scattering point it does next-event estimation to the sun. Where the window lets the sun through, that connection succeeds — and the beam appears.
