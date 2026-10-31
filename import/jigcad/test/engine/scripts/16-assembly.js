// An assembly: a base and a lid joined by a revolute joint between ports, printed open with a 0.4 mm gap.
const tray = (name, y) => j.part(name)
  .extrude(j.sketch('t', { on: j.plane.XY }).rect('r', 60, 40, { center: true }).profiles(), mm(10), { id: 'body' })
  .port('hinge', j.frame({ origin: j.pt(0, y, 10), x: j.dir('+Y'), z: j.dir('+X') }))
return j.assembly('clamshell')
  .add('base', tray('base', 20), { ground: true })
  .add('lid', tray('lid', 20.4))
  .joint('h', j.joint.revolute({ limits: [deg(0), deg(180)] }), 'base:hinge', 'lid:hinge')
  .printInPlace(['base', 'lid'], { clearance: mm(0.4), pose: { h: deg(180) }, check: true })
