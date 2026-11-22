---
id: A-04
title: material.define: a tile material
group: Algebra
about: A new material kind in ten lines: its attributes become methods, sliders and targets for fragments.
tries: Add a grout depth attribute that bumps the grout|Make hexagonal tiles
docs: grammar, architecture
focus: params
---
# material.define: a tile material

`material.define(name, attributes, body)` makes a new kind of material:

- its **attributes** are params, so each becomes a builder method (`.tiles(8)`), a slider and an attribute fragments can `map`;
- its **body** is a function from attributes to a BSDF, traced once per distinct use.

`material.pbr` itself is defined this way (see `src/stdlib.js`). Here, `tiles()` mixes a glazed ceramic with a rough grout by a mask computed from the UV grid.
