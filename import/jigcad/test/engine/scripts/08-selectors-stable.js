// Selectors through genealogy: the same names before and after a parameter change.
const base = j.sketch('base', { on: j.plane.XY }).rect('r', 'w', 'd', { center: true })
return j.part('box')
  .params({ w: mm(60), d: mm(40), h: mm(30) })
  .extrude(base.profiles(), 'h', { id: 'body' })
  .fillet(j.feat('body').sideFaces().edges('|Z').where(e => e.convex).expect(4), mm(3), { id: 'corners' })
  .chamfer(j.feat('body').endFace().edges(), mm(1), { id: 'lead' })
