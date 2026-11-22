---
id: C-03
title: Focal length and perspective
group: Camera
about: The subject stays the same size; the background does not. Perspective depends on where you stand, not on the lens.
tries: Set 24 mm and 200 mm and compare the background|Why do portrait photographers prefer 85 mm?
docs: sensor
focus: params
---
# Focal length and perspective

A longer lens magnifies; walking back shrinks. Do both in proportion and the subject keeps its size while everything behind it changes — the "dolly zoom" from *Vertigo*.

Here the camera distance is tied to the focal length: $d = 40 f$. At 24 mm you stand ~1 m away and the corridor stretches; at 200 mm you are 8 m back and the far wall looms. Perspective — the relative size of near and far things — depends only on camera position.

The focal length is a **static** param (it changes the projection), the distance a host function of it (`P.f.map(f => f * 40)`).
