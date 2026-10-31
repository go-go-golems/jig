// A fillet that cannot fit: the diagnostic reports the largest radius that works.
return j.part('mount')
  .extrude(j.sketch('p', { on: j.plane.XY }).rect('r', 50, 30, { center: true }).profiles(), mm(4), { id: 'plate' })
  .fillet(j.feat('plate').sideFaces().edges('|Z'), mm(20), { id: 'huge' })
