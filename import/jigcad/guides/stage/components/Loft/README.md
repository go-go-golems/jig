# Loft

A solid drawn as a stack of elliptical sections: a 2 px outline filled with paper, thin rings and an optional meridian on its surface.

**Provide** stations `{ c, A, B, a, b, ring }` from one end to the other (centre, two unit axes, two radii in metres, ring flag) and call `g.loft(stations, { name, tone, meridian, bias, chain, plane, under, ghost, fill, noShadow, after })` in a `figure`-layer view.

- The outline is the union of the convex hulls of neighbouring sections, stroked at 2 px and filled with `st-bg` (`fill: 'soft'`: `st-soft`).
- `ring: 1` draws the near half of that section at 0.55 px and 70%; `meridian: true` joins the sections' `B` ends along the body.
- `tone` recolours the outline only; the fill stays paper.
- Do add sections where the outline bends and where the girth should read.
- Don't fill a loft with a colour or draw it without its paper fill: the fill is what hides the parts behind it.
