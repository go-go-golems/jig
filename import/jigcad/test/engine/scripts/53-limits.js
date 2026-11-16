// A lid on a hinge that opens 0–110°: a drive past the limit is held there, a study past it leaves gaps marked
// with the joint, and a drag stops at the limit.
const plate = (name, w, d) => j.part(name).extrude(j.sketch('s', { on: j.plane.XY }).rect('r', w, d, { center: true }).profiles(), mm(3), { id: 'body' })
const box = plate('box', 60, 40).port('hinge', j.frame({ origin: j.pt(0, 20, 3), x: j.dir('+Y'), z: j.dir('-X') }))
const lid = plate('lid', 60, 40).port('hinge', j.frame({ origin: j.pt(0, 20, 0), x: j.dir('+Y'), z: j.dir('-X') }))
  .port('front', j.frame({ origin: j.pt(0, -20, 3), x: j.dir('+X'), z: j.dir('+Z') }))
return j.assembly('box')
  .add('box', box, { ground: true }).add('lid', lid)
  .joint('h', j.joint.revolute({ limits: [deg(0), deg(110)] }), 'box:hinge', 'lid:hinge')
  .drive('h', deg(140))
  .study('open', { drive: 'h', from: deg(0), to: deg(180), steps: 18 })
