---
id: W-04
title: Kinetic sculpture
group: Live
about: Nested gimbals turning at incommensurate rates: transforms that are fields of time, composed through the hierarchy.
tries: Make the outer ring stop|Add a fourth ring
docs: architecture
---
# Kinetic sculpture

Three rings, each a child of the previous, each turning about a different axis with `fx.time()`. The innermost ring's world transform is the product of all three rotations — evaluated every frame on the host while the kernel only sees the resulting matrices.

The rates ($1$, $\sqrt 2$, $\varphi$ rad/s) are mutually irrational, so the sculpture never repeats.
