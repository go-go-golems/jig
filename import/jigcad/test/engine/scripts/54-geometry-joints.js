// Joint ends picked on geometry (Fusion's joint origins): the plate's bore and the arm's bore give their axes, the
// plate's at its top end and the arm's at its bottom, so the arm sits on the plate, pinned through both holes.
const plate = j.part('plate').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 60, 30, { center: true }).circle('h', 3, { at: [20, 0] }).profiles(), mm(5), { id: 'body' })
const arm = j.part('arm').extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 50, 10, { center: true }).circle('h', 3, { at: [-20, 0] }).profiles(), mm(4), { id: 'body' })
  .port('tip', j.frame({ origin: j.pt(20, 0, 4), x: j.dir('+X'), z: j.dir('+Z') }))
return j.assembly('pinned')
  .add('plate', plate, { ground: true }).add('arm', arm)
  .joint('hinge', j.joint.revolute(), j.frame.on(j.on('plate', j.sel.faces('%cylinder')), { at: 'end' }), j.frame.on(j.on('arm', j.sel.faces('%cylinder')), { at: 'start' }))
  .drive('hinge', deg(90))
  .measure('bore', m => m.point('arm:@hinge.b'))
  .measure('tip', m => m.point('arm:tip'))
