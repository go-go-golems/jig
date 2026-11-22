---
id: E-05
title: Fireflies and the clamp
group: Engines
about: A small bright light seen through glass makes rare, huge samples. Clamping them removes the fireflies — and some energy.
tries: Set clamp to 0 (off) and watch the floor|How much energy does clamp = 4 remove?
docs: monte-carlo, invariants
focus: params
---
# Fireflies and the clamp

Light focused by a glass sphere onto the floor — a **caustic** — can only be found by BSDF sampling: a path from the floor must happen to pass through the sphere and hit the small light. When it does, its weight is enormous: a **firefly**.

`integrator.path({ clamp: k })` caps each path's throughput after the first bounce. It works, and it is **biased**: the caustic gets dimmer, and the Console says so (**I460**).

The honest fix is a better estimator (bidirectional methods, path guiding); the clamp is a practical knob, labelled as such.
