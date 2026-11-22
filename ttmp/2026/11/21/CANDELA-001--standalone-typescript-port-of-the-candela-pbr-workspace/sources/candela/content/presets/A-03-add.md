---
id: A-03
title: add: checked sums
group: Algebra
about: bsdf.add can create energy, so it is checked. Scale the parts, or use layer, and the warning goes away.
tries: Fix W420 two different ways|Run the furnace on the added BSDF
docs: algebra, invariants
focus: console
---
# add: checked sums

`add(a, b)` is the sum $f_a + f_b$. It is the right tool when two lobes describe physically separate paths (a glow plus a reflection, say), but nothing stops the sum reflecting more than it receives. The compiler estimates the directional albedo of each side and warns:

> **W420** — bsdf.add reflects up to 1.42× the incident light

Two fixes: scale the parts (`a.scale(0.5)`, `b.scale(0.5)`), or replace `add` with `layer` — then the bottom only receives what the top transmits.

The middle sphere glows because the scene renders the warning case, so you can see what "creating energy" looks like in a furnace-like environment.
