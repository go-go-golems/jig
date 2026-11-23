---
id: F-07
title: World space and local space
group: Fields
about: p.P is the world position, p.local the object’s own: one pattern slides across moving objects, the other rides with them.
tries: Rotate both boxes by 45° and compare|Use p.local for the floor — what happens?
docs: architecture
---
# World space and local space

Both boxes carry the **same** checker, three times per metre. On the left it is computed from `p.P` (world space): the pattern stays put while the box turns, like a projector's light on a moving object. On the right it is computed from `p.local`: the pattern is glued to the box.

Both boxes are turned by `fx.time()`, so you can watch the difference. Most materials want local space; world space is right for things like snow on top (`p.N.y`) or a light projected from outside.
