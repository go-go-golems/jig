// A tall thin part: 8 mm across, 160 mm tall.
return j.part('rod')
  .extrude(j.sketch('c', { on: j.plane.XY }).circle('o', 4).profiles(), mm(160), { id: 'body' })
  .chamfer(j.feat('body').endFace().edges(), mm(1), { id: 'tip' })
