// Very flat: a 200 × 150 × 0.8 mm sheet with a slot (a part almost all plan).
return j.part('shim')
  .extrude(j.sketch('p', { on: j.plane.XY }).rect('r', 200, 150, { center: true, r: 8 }).profiles(), mm(0.8), { id: 'sheet' })
  .cut(j.sketch('s', { on: j.plane.offset(j.plane.XY, mm(0.8)) }).rect('s', 120, 10, { center: true, r: 5 }).profiles(), mm(0.8), { id: 'slot' })
