---
id: S-04
title: Incandescence
group: Spectral
about: A poker heated at one end: its colour is Planck’s law along a temperature field, and its luminance spans six orders of magnitude.
tries: Make the hot end 2500 K|At what temperature does steel start to glow visibly?
docs: units
focus: params
---
# Incandescence

Every hot body glows with the spectrum of a blackbody at its temperature. Two things change together as it heats:

- **colour** — the peak moves from infrared toward visible: dull red (≈ 900 K), orange (1300 K), yellow (1800 K), white (≥ 5000 K);
- **brightness** — near 555 nm, Wien's approximation gives $L \propto e^{-c_2 / \lambda T}$ with $c_2/\lambda \approx 25\,900$ K. From 1000 to 2000 K the luminance rises about **400 000 times**.

The poker's emission is a field of position: temperature falls along its length, `fx.blackbody(T)` gives the colour at luminance 1, and the Wien factor gives the brightness. The row of spheres shows 1000 → 2000 K at equal luminance, so you see only the colour change.
