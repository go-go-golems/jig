// A needle-bar linkage running at 3000 stitches per minute.
const r = 15.5, L = 60
const steel = j.material('steel')
const frameAt = (origin, x, z = '+Z') =>
  j.frame({ origin, x: j.dir(x), z: j.dir(z) })
const bar = (name, len, w, t) => j.part(name).material(steel)
  .extrude(j.sketch('s', { on: j.plane.XY })
    .rect('r', len + w, w, { center: true }).profiles(),
  mm(t), { id: 'body' })

const crank = bar('crank', r, 14, 6)
  .port('pivot', frameAt(j.pt(-r / 2, 0, 0), '+X'))
  .port('pin', frameAt(j.pt(r / 2, 0, 6), '-X'))
const rodOutline = j.sketch('s', { on: j.plane.XY })
  .rect('r', L + 12, 12, { center: true })
  .circle('big', 3, { at: [-L / 2, 0] })
  .circle('small', 2.5, { at: [L / 2, 0] })
const rod = j.part('rod').material(steel)
  .extrude(rodOutline.profiles(), mm(5), { id: 'body' })
  .port('big', frameAt(j.pt(-L / 2, 0, 0), '+X'))
  .port('small', frameAt(j.pt(L / 2, 0, 0), '-X'))
const guide = frameAt(j.pt(0, 0, 3), '+X', '-Y')
const slider = bar('slider', 6, 12, 6)
  .port('wrist', frameAt(j.pt(0, 0, 6), '+Y'))
  .port('guide', guide)
const baseOutline = j.sketch('p', { on: j.plane.offset(j.plane.XY, -4) })
  .rect('r', 50, 130, { center: true })
const frame = j.part('frame')
  .extrude(baseOutline.profiles(), mm(4), { id: 'plate' })
  .port('main', frameAt(j.pt(0, 0, 0), '-Y'))
  .port('guide', guide)

const head = j.assembly('needle-bar drive')
  .add('frame', frame, { ground: true }).add('crank', crank)
  .add('rod', rod).add('slider', slider)
  .joint('main', j.joint.revolute(), 'frame:main', 'crank:pivot')
  .joint('pin', j.joint.revolute(), 'crank:pin', 'rod:big')
  .joint('wrist', j.joint.revolute(), 'rod:small', 'slider:wrist')
  .joint('guide', j.joint.prismatic(), 'frame:guide', 'slider:guide')
  .drive('main', deg(30)).hint('pin', deg(180))
  .measure('clamp', m => m.point('slider:wrist')[1])
  .study('cycle', { drive: 'main', from: deg(0), to: deg(360), steps: 360 })
  .speed('main', turn(3000).div(minute(1)))
  .gravity('-Y')
  .wrench('slider:wrist', row => row.clamp < -70 ? [0, N(4), 0] : null,
    { label: 'needle in the cloth' })
  .reactions('cycle')

return head
