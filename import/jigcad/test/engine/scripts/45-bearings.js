// A shaft in two coaxial bearings: Kutzbach −4, rank 5, so M = 1 with 5 redundant equations; misalign the back
// bearing and the two bearings are the minimal conflicting set.
const e = 0
const shaft = j.part('shaft')
  .extrude(j.sketch('s', { on: j.plane.YZ }).circle('c', 8).profiles(), mm(90), { id: 'body' })
  .port('front', j.frame({ origin: j.pt(15, 0, 0), x: j.dir('-Z'), z: j.dir('+X') }))
  .port('back', j.frame({ origin: j.pt(75, 0, 0), x: j.dir('-Z'), z: j.dir('+X') }))
const frame = j.part('frame')
  .extrude(j.sketch('b', { on: j.plane.offset(j.plane.XY, -25) }).rect('r', 100, 40, { center: true }).profiles(), mm(4), { id: 'base' })
  .port('front', j.frame({ origin: j.pt(15, 0, 0), x: j.dir('-Z'), z: j.dir('+X') }))
  .port('back', j.frame({ origin: j.pt(75, e, 0), x: j.dir('-Z'), z: j.dir('+X') }))
return j.assembly('shaft in bearings')
  .add('frame', frame, { ground: true }).add('shaft', shaft)
  .joint('front', j.joint.revolute(), 'frame:front', 'shaft:front')
  .joint('back', j.joint.revolute(), 'frame:back', 'shaft:back')
