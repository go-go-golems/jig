---
id: B-02
title: Params are sliders
group: Basics
about: Typed, unit-aware knobs. Dynamic params write a uniform; static ones rebuild the kernel.
tries: Add a param for the sun elevation|Set gloss to 0.95 and look|Explain the difference between a static and a dynamic param
docs: architecture
focus: params
---
# Params are sliders

Every `param.*` becomes a control in the **Params** view, with its unit and range. Drag one: the render restarts its accumulation, but no shader is rebuilt — a dynamic param is a **uniform**, a slot in a buffer.

`coat` is declared `.static()`: it is a *specialisation constant*. Turning it off re-runs the build and swaps in a kernel without the coat's code at all (the kernel is cached by its source, so turning it back on is instant).

`P.gloss.map(g => 1 - g)` is a **host function**: it runs on the CPU when the param moves and feeds its own uniform.
