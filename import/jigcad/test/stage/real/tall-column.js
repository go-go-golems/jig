// Very tall: an 8 × 8 × 220 mm column with a chamfered top (a part almost all elevation).
return j.part('column')
  .extrude(j.sketch('p', { on: j.plane.XY }).rect('r', 8, 8, { center: true }).profiles(), mm(220), { id: 'body' })
  .chamfer(j.feat('body').endFace().edges(), mm(1), { id: 'top' })
