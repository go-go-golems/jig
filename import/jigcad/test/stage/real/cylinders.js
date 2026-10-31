// Cylinders standing and lying: a Ø30 × 40 mm boss on a plate and a Ø12 mm pin lying along X (silhouettes).
return j.part('boss')
  .extrude(j.sketch('p', { on: j.plane.XY }).rect('r', 80, 50, { center: true }).profiles(), mm(5), { id: 'plate' })
  .extrude(j.sketch('c', { on: j.plane.offset(j.plane.XY, mm(5)) }).circle('c', 15, { at: [-15, 0] }).profiles(), mm(40), { id: 'boss' })
  .extrude(j.sketch('pin', { on: j.plane.YZ }).circle('c', 6, { at: [0, 20] }).profiles(), { symmetric: mm(70) }, { id: 'pin' })
