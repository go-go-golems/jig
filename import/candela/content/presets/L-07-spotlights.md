---
id: L-07
title: Spotlights on a stage
group: Light
about: Cones and soft edges: three coloured spots overlapping on a stage add up as light does.
tries: Change the red spot to 5000 K white and compare|Make the cones wider with the same lumens — what happens to the brightness?
docs: units
---
# Spotlights on a stage

Three spots, 2000 lm each, red, green and blue. Where they overlap they **add** — light is linear — and the triple overlap is near white. The cone sets the angle; `.softEdge()` makes the falloff a smoothstep between the inner and outer cosines.

The exposure is fixed at EV 7.5 — a dark stage would fool an averaging meter into blowing out the lit part. With `powerMode('cone')` (the default), all the flux goes into the cone: widening it from 15° to 30° spreads the same lumens over about four times the solid angle, so the intensity drops by four:

$$I = \frac{\Phi}{2\pi(1 - \cos\theta)}$$
