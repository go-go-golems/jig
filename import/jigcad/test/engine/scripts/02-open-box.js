// The open box: extrude, round the vertical corners, shell with the top open.
const base = j.sketch('base', { on: j.plane.XY }).rect('r', 60, 40, { center: true })
return j.part('caddy')
  .params({ wall: mm(2) })
  .extrude(base.profiles(), mm(30), { id: 'body' })
  .fillet(j.feat('body').sideFaces().edges('|Z').expect(4), mm(5), { id: 'corners' })
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
