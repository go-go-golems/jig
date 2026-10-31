// A boss sketched on the plate's top face joins the plate (op default: join when touching).
return j.part('mount')
  .extrude(j.sketch('p', { on: j.plane.XY }).rect('r', 50, 30, { center: true }).profiles(), mm(4), { id: 'plate' })
  .extrude(j.sketch('b', { on: j.feat('plate').endFace() }).circle('c', 6, { at: [0, 0] }).profiles(), mm(10), { id: 'boss' })
  .fillet(j.feat('boss').edges('%circle'), mm(1.5), { id: 'blend' })
