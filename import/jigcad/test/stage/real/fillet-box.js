// A box with every top edge and vertical edge filleted: tangent edges and curved silhouettes.
return j.part('soap')
  .extrude(j.sketch('b', { on: j.plane.XY }).rect('r', 90, 60, { center: true, r: 10 }).profiles(), mm(25), { id: 'body' })
  .fillet(j.feat('body').endFace().edges(), mm(6), { id: 'round' })
  .shell(j.feat('body').startFace(), mm(2), { id: 'shell' })
