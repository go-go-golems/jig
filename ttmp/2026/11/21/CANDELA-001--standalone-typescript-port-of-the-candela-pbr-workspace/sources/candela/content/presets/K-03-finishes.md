---
id: K-03
title: Finishes: a chart of machined and coated metals
group: Machines
about: Sixteen pucks — turned, faced, ground, milled, brushed, polished, cast, black oxide, zinc, anodized, paint, rubber — under one strip light you can move around them.
tries: Move the light around the chart and watch the turned faces|Turn the anisotropy off on the turned steel and compare|Make a satin-chrome puck|Which finishes would read as the same under a big softbox?
docs: cad
focus: params
---
# Finishes

A CAD model says what a part is made of and how each face was made; `finish` turns that into a material. Every finish is a `material.pbr()` you can keep editing: a measured reflectance for the metal, a roughness for the process, and — for machined faces — **anisotropy** with a **tangent field** that says which way the grooves run.

| finish | grooves | tangent |
|---|---|---|
| `finish.turned()` | circles about the axis, on the side | `fx.tangent.around(axis)` |
| `finish.faced()` | concentric rings on a flat end | `fx.tangent.around(axis)` |
| `finish.ground()` | fine, straight (flat) or circular (round) | `along(dir)` / `around(axis)` |
| `finish.milled()` | a cutter's passes | `along(dir)` |
| `finish.brushed()` | straight grain | `along(dir)` |
| `finish.hobbed()` | along the tooth | `along(axis)` |

Highlights stretch **across** the grooves: a turned cylinder under a strip light shows a long vertical streak, a faced end shows a bright cross that turns as you move the light — the signature of a lathe-finished part. Coatings: black oxide and zinc are thin conversion coatings, so the grooves show through them; anodizing is dye in an oxide over aluminium (a tinted metal under a satin coat); paint and rubber hide the substrate.

Use **Light around the chart** to swing the strip; the cross on the faced tops follows it. The same vocabulary drives `.autoFinish()`, which reads `material`, `process` and `finish` from part and face metadata — see *A gear train in motion*.
