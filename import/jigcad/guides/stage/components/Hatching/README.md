# Hatching

Poché: 45° hatch lines for what is solid or cut. Prop faces that are slopes, sides or backs, and the lot's boundary band.

**Provide** `g.poly(points, { fill: 'hatch', name })` for a hatched face (paper first, then the pattern), `fill: 'stage'` for a riding surface, and `g.boundary({ size, band })` for the lot's edge.

- The tile is 6 px with a 0.6 px `st-shadow` line, drawn at double resolution; lines are 4.2 px apart across.
- The boundary band is filled with the even-odd rule and outlined at 1 px on both sides.
- Do give every new obstacle the same split: the faces you ride in paper, the rest hatched.
- Don't hatch at another angle or pitch, or in another colour.
