// Estimated study dimensions, mm. X is lateral, Z is up, plate top Z=0.
const shaft = [0, 88], gatePivot = [0, 73], anchor = [-16, 77]
const radius = 12, rodLength = 32, rockerLength = 20, leverLength = 22
const planar = ([x, z]) => j.frame({
  origin: j.pt(x, 0, z), x: j.dir('+X'), z: j.dir('-Y'),
})
const vertical = () => j.frame({
  origin: j.pt(0, 0, 0), x: j.dir('+X'), z: j.dir('+Z'),
})
const origin = [0, 0]
const metal = (name, color) => j.part(name).material(j.material('steel'))
  .color(color)
const circle = (p, r) => j.region.circle(r, { at: p })
const face = (profile, depth) =>
  profile.on(j.plane.offset(j.plane.XZ, mm(depth)))
const section = (profile, z) =>
  profile.on(j.plane.offset(j.plane.XY, mm(z)))
function frame() {
  const web = j.region.slot(anchor, shaft, 8)
    .union(j.region.slot(shaft, gatePivot, 8))
  return metal('Head bearing references', '#586873')
    .extrude(face(web, -13), mm(4), { id: 'bearingWeb' })
    .port('shaft', planar(shaft)).port('gate', planar(gatePivot))
    .port('anchor', planar(anchor))
}
function crank() {
  const end = [0, -radius]
  return metal('Arm shaft and crank', '#b18e54')
    .extrude(face(circle(origin, 3.7), -16), mm(18), { id: 'shaft' })
    .extrude(face(j.region.slot(origin, end, 8), 1), mm(3), { id: 'crank' })
    .extrude(face(circle(end, 2), 4), mm(6), { id: 'pin' })
    .port('axis', planar(origin)).port('pin', planar(end))
}
function link(name, length, depth, color) {
  const end = [length, 0]
  const web = j.region.slot(origin, end, 6)
    .subtract(circle(origin, 2)).subtract(circle(end, 2))
  return metal(name, color).extrude(face(web, depth), mm(2), { id: 'web' })
    .port('start', planar(origin)).port('end', planar(end))
}
function gate() {
  const sleeve = circle(origin, 4).subtract(circle(origin, 2.65))
  return metal('Needle bar swinging support', '#738693')
    .extrude(section(sleeve, -4), mm(8), { id: 'upperGuide' })
    .extrude(section(j.region.rect(3, 3, { at: [0, 4] }), -33),
      mm(36), { id: 'spine' })
    .extrude(section(sleeve, -34), mm(6), { id: 'lowerGuide' })
    .port('pivot', planar(origin)).port('slide', vertical())
}
function bar() {
  return metal('Needle bar', '#c0c9cc')
    .extrude(section(circle(origin, 2.5), -26), mm(62), { id: 'bar' })
    .extrude(face(circle(origin, 2), 1), mm(6), { id: 'driveStud' })
    .port('slide', vertical()).port('drivePin', planar(origin))
    .port('clamp', planar([0, -26]))
}
function clamp() {
  return metal('Needle clamp', '#616e79')
    .extrude(section(j.region.rect(7, 6), -4), mm(5), { id: 'block' })
    .port('seat', planar(origin)).port('needle', planar([0, -4]))
}
function needle() {
  const outline = j.region.polygon([
    [-0.8, 0], [0.8, 0], [0.5, -14], [0, -17], [-0.5, -14],
  ])
  return metal('Needle envelope', '#909ba0')
    .extrude(face(outline, -0.45), mm(0.9), { id: 'blade' })
    .port('shank', planar(origin)).port('tip', planar([0, -17]))
}
function takeUp() {
  const elbow = [leverLength, 0], eye = [-20, -9]
  const web = j.region.slot(origin, elbow, 6)
    .union(j.region.slot(origin, [-10, -2], 5))
    .union(j.region.slot([-10, -2], eye, 5))
    .subtract(circle(origin, 2)).subtract(circle(elbow, 2))
    .subtract(circle(eye, 1.3))
  return metal('Thread take-up lever', '#b67952')
    .extrude(face(web, 8), mm(2), { id: 'lever' })
    .port('pin', planar(origin)).port('support', planar(elbow))
    .port('eye', planar(eye))
}
function plate() {
  const profile = j.region.rect(48, 28)
    .subtract(j.region.slot([-4, 0], [4, 0], 3))
  return metal('Needle plate datum', '#84949b')
    .extrude(section(profile, -2), mm(2), { id: 'plate' })
}
const radians = a => a * Math.PI / 180
const degrees = a => a * 180 / Math.PI
const heading = (x, z) => degrees(Math.atan2(z, x))
function pose(phase, swing) {
  const t = radians(phase), a = radians(swing)
  const pin = [shaft[0] + radius * Math.sin(t),
    shaft[1] - radius * Math.cos(t)]
  const dx = pin[0] - gatePivot[0], dz = pin[1] - gatePivot[1]
  const across = dx * Math.cos(a) + dz * Math.sin(a)
  const slide = -dx * Math.sin(a) + dz * Math.cos(a)
    - Math.sqrt(rodLength ** 2 - across ** 2)
  const stud = [gatePivot[0] - slide * Math.sin(a),
    gatePivot[1] + slide * Math.cos(a)]
  // Intersect circles about the crank pin and the stationary supporter.
  const x = anchor[0] - pin[0], z = anchor[1] - pin[1]
  const d = Math.hypot(x, z)
  const along = (leverLength ** 2 - rockerLength ** 2 + d ** 2) / (2 * d)
  const side = Math.sqrt(leverLength ** 2 - along ** 2)
  const elbow = [pin[0] + (along * x + side * z) / d,
    pin[1] + (along * z - side * x) / d]
  return { slide, stud, pin, elbow,
    rod: heading(pin[0] - stud[0], pin[1] - stud[1]),
    lever: heading(elbow[0] - pin[0], elbow[1] - pin[1]),
    rocker: heading(elbow[0] - anchor[0], elbow[1] - anchor[1]) }
}
function jointValues(mode, phase, swing) {
  const q = pose(phase, swing)
  const params = { swing: deg(swing), slide: mm(q.slide) }
  if (mode !== 'swing') {
    params.turn = deg(phase)
    params.rodAngle = deg(q.rod - swing)
  }
  if (mode === 'upper head') {
    params.leverAngle = deg(q.lever - phase)
    params.rockerAngle = deg(q.rocker)
  }
  return params
}
function assemble(mode, phase, swing) {
  let head = j.assembly('Singer 44S ' + mode)
    .add('head', frame(), { ground: true })
    .add('plate', plate(), { at: j.tx.move(0, 0, 0) })
    .add('gate', gate()).add('bar', bar())
    .add('clamp', clamp()).add('needle', needle())
    .joint('swing', j.joint.revolute(), 'head:gate', 'gate:pivot')
    .joint('slide', j.joint.slider(), 'gate:slide', 'bar:slide')
    .joint('clamped', j.joint.fixed(), 'bar:clamp', 'clamp:seat')
    .joint('seated', j.joint.fixed(), 'clamp:needle', 'needle:shank')
  if (mode !== 'swing') {
    head = head.add('crank', crank())
      .add('rod', link('Needle connecting rod', rodLength, 5, '#939da5'))
      .joint('turn', j.joint.revolute(), 'head:shaft', 'crank:axis')
      .joint('rodAngle', j.joint.revolute(), 'bar:drivePin', 'rod:start')
  }
  if (mode === 'upper head') {
    head = head.add('lever', takeUp())
      .add('rocker', link('Take-up supporter', rockerLength, 10, '#778790'))
      .joint('leverAngle', j.joint.revolute(), 'crank:pin', 'lever:pin')
      .joint('rockerAngle', j.joint.revolute(), 'head:anchor', 'rocker:start')
  }
  return head.params(jointValues(mode, phase, swing))
}
// Alternate penetration sides every turn. Dwell through needle entry.
// The smooth transfer around top dead center is a study cam law.
function swingAt(phase, amplitude) {
  const cycle = ((phase % 720) + 720) % 720
  const turn = cycle % 360
  const u = Math.min(1, Math.max(0, (turn - 120) / 120))
  const sign = cycle < 360 ? 1 : -1
  return amplitude * sign * Math.cos(Math.PI * u)
}
return { assemble, pose, swingAt, jointValues }
