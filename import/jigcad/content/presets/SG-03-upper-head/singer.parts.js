// Estimated study dimensions, mm. X is lateral, Z is up, plate top Z=0.
const shaft = [0, 88], gatePivot = [0, 73], anchor = [-10, 111]
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
    .subtract(circle(anchor, 1.55)).subtract(circle(gatePivot, 2.1))
    .subtract(circle(shaft, 3.8))
  return metal('Head bearing references', '#586873')
    .extrude(face(web, -11.6), mm(2.4), { id: 'bearingWeb' })
    .port('shaft', planar(shaft)).port('gate', planar(gatePivot))
    .port('anchor', planar(anchor))
    .port('frontClip', j.frame({origin:j.pt(anchor[0],-12.9,anchor[1]),
      x:j.dir('+X'), z:j.dir('-Y')}))
    .port('rearClip', j.frame({origin:j.pt(anchor[0],12.05,anchor[1]),
      x:j.dir('+X'), z:j.dir('-Y')}))
}
function crank() {
  const end = [0, -radius]
  return metal('Arm shaft and crank', '#b18e54')
    .extrude(face(circle(origin, 3.7), 15), mm(9), { id: 'shaft' })
    .extrude(face(j.region.slot(origin, end, 8), 13.6), mm(2.4), { id: 'crank' })
    .extrude(face(circle(end, 2), 4.85), mm(9), { id: 'pin' })
    .port('axis', planar(origin)).port('pin', planar(end))
}
// A14/A22 are separate shaft bushings. This local bearing uses a
// clearance envelope; the far bearing and casting are outside the study.
function shaftBearing() {
  const bore = circle(origin, 3.77)
  return metal('Arm shaft bushing envelope', '#9e9176')
    .extrude(face(circle(origin, 5.6).subtract(bore), 17.2),
      mm(5.6), { id: 'bushing' }).port('seat', planar(origin))
}
function mountCrank(head) {
  return head.add('crank', crank()).add('shaftBearing', shaftBearing())
    .joint('turn', j.joint.revolute(), 'head:shaft', 'crank:axis')
    .joint('bearingSeat', j.joint.fixed(), 'head:shaft', 'shaftBearing:seat')
}
function link(name, length, depth, color) {
  const end = [length, 0]
  const web = j.region.slot(origin, end, 6)
    .subtract(circle(origin, 2)).subtract(circle(end, 2))
  return metal(name, color).extrude(face(web, depth), mm(2), { id: 'web' })
    .port('start', planar(origin)).port('end', planar(end))
}
// Catalog E, positions 1, 7, 18–20, 35. The bearing and clamp ports use
// the existing functional datums. Guessed envelope dimensions are in mm.
const side = (profile, x) =>
  profile.on(j.plane.offset(j.plane.YZ, mm(x)))
const roundSection = (outer, inner) =>
  circle(origin, outer).subtract(circle(origin, inner))
function gate() {
  const bore = 2.6
  const upper = roundSection(4.5, bore)
  const lower = roundSection(4.3, bore)
    .subtract(j.region.rect(4.5, 6, { at: [0, -4] }))
  const rib = j.region.polygon([
    [-5.7, -30.6], [-2.8, -30.6], [-2.8, -27.6], [-3.8, -26.4],
    [-3.8, 1.7], [-1.3, 3.2], [-1.3, 5.6], [-6, 5.6],
  ])
  return metal('E1 swinging needle bar supporter', '#738693')
    .extrude(face(rib, -3.7), mm(3), { id: 'castRib' })
    .extrude(section(upper, 2), mm(5.5), { id: 'upperBearing' })
    .extrude(section(lower, -30.6), mm(3.5), { id: 'openLowerBearing' })
    .extrude(face(circle(origin, 4.7), -8.8), mm(5.3),
      { id: 'rearPivotBoss' })
    .cut(section(circle(origin, bore), -31), mm(39), { id: 'guideLineBore' })
    .cut(face(circle(origin, 2.1), -9), mm(4.5), { id: 'pivotBore' })
    .port('pivot', planar(origin)).port('slide', vertical())
}
function gatePin() {
  return metal('E7 needle bar supporter pin', '#bfc6c8')
    .extrude(face(circle(origin, 2), -15), mm(9.8), { id: 'journal' })
    .extrude(face(circle(origin, 3.35), -16.2), mm(1.2), { id: 'head' })
    .port('axis', planar(origin))
}
function bar() {
  return metal('E18 needle bar', '#c0c9cc')
    .extrude(section(circle(origin, 2.5), -26), mm(62), { id: 'shaft' })
    .extrude(section(circle(origin, 2.12), -30), mm(4), { id: 'clampSeat' })
    .cut(section(circle(origin, 1.07), -30.1), mm(22.02),
      { id: 'needleSocket' })
    .cut(side(circle([0, -28], 1.07), 0.8), mm(2), { id: 'screwAccess' })
    .port('slide', vertical()).port('drivePin', planar(origin))
    .port('clamp', planar([0, -26]))
}
function driveBracket() {
  const bore = circle(origin, 2.53)
  const collar = j.region.rect(6.8, 6.5).subtract(bore)
  return metal('E50 needle bar bracket assembly', '#9c9991')
    .extrude(section(collar, 2.7), mm(3.2), { id: 'shaftCollar' })
    .extrude(face(j.region.slot([0, 0], [0, 4.4], 3.8), 2.7),
      mm(1.6), { id: 'collarArm' })
    .extrude(face(circle(origin, 2), 4.3), mm(2.7), { id: 'rodJournal' })
    .cut(side(circle([0, 4.3], 0.72), 2.3), mm(1.3),
      { id: 'collarSetScrewBore' })
    .port('axis', planar(origin))
}
function clamp() {
  const shell = j.region.slot([-0.5, 0], [2.7, 0], 6.4)
    .subtract(circle(origin, 2.15))
  return metal('E19 needle clamp', '#909a9f')
    .extrude(section(shell, -4), mm(4), { id: 'collar' })
    .cut(side(circle([0, -2], 1.08), 1.8), mm(4.5),
      { id: 'rightHandScrewBore' })
    .port('seat', planar(origin)).port('needle', planar([0, -4]))
}
function clampScrew() {
  const center = [0, -2]
  return metal('E20 slotted needle clamp screw', '#bfc6c8')
    .extrude(side(circle(center, 1.02), 1), mm(5), { id: 'screwShank' })
    .extrude(side(circle(center, 1.6), 6), mm(5.4), { id: 'fingerStem' })
    .extrude(side(circle(center, 1.05), 11.4), mm(1.85), { id: 'neck' })
    .extrude(face(circle([15.5, -2], 3.05), -0.85),
      mm(1.7), { id: 'thumbPaddle' })
    .cut(face(j.region.rect(2.8, 0.74, { at: [18.45, -2] }), -1),
      mm(2), { id: 'rimSlot' })
    .port('axis', planar(origin))
}
function needle() {
  // Representative Schmetz 130/705 H NM90. The manufacturer's O1 dimension
  // goes to the upper edge of the eye. Needle tip position is the SG datum.
  const tip = -17, eyeTop = -12, butt = eyeTop + 33.9
  const blank = j.sketch('needleBlank', { on: j.plane.XZ })
    .polyline('section', [[0, tip], [0.08, tip + 0.16],
      [0.45, tip + 3.4], [0.45, -0.6], [1.02, 4], [1.02, butt - 0.24],
      [0.85, butt], [0, butt]], { closed: true })
  const eye = j.region.slot([0, eyeTop - 1.15], [0, eyeTop - 0.15], 0.3)
  return metal('E35 universal household needle NM90', '#aeb9c0')
    .revolve(blank.profiles(), j.axis.Z, turn(1), { id: 'turnedBlank' })
    .cut(section(j.region.rect(3, 1, { at: [0, 1.23] }), -0.1),
      mm(butt + 0.3), { id: 'rearShankFlat' })
    .cut(face(eye, -1.2), mm(2.4), { id: 'threadEye' })
    .cut(face(j.region.slot([0, -12.4], [0, -0.4], 0.18), 0.32),
      mm(0.8), { id: 'longFrontGroove' })
    .cut(face(j.region.slot([0, -11.7], [0, -8.5], 0.8), -0.55),
      mm(0.34), { id: 'rearScarf' })
    .port('shank', planar(origin)).port('tip', planar([0, tip]))
    .port('threadEye', planar([0, eyeTop - 0.65]))
}
function addNeedleHardware(head) {
  return head.add('clampScrew', clampScrew())
    .add('driveBracket', driveBracket()).add('gatePin', gatePin())
    .joint('clampScrewSeat', j.joint.fixed(), 'clamp:seat', 'clampScrew:axis')
    .joint('bracketSeat', j.joint.fixed(), 'bar:drivePin', 'driveBracket:axis')
    .joint('gatePinSeat', j.joint.fixed(), 'head:gate', 'gatePin:axis')
}
// Parts are shown at scale. Positive spread separates them for inspection.
function needleHardwareStudy(spread) {
  return j.assembly('Needle, clamp and bar hardware')
    .add('bar', bar(), { ground: true })
    .add('driveBracket', driveBracket(), { at: j.tx.move(-spread, 0, 0) })
    .add('clamp', clamp(), { at: j.tx.move(0, 0, -26 - spread) })
    .add('clampScrew', clampScrew(),
      { at: j.tx.move(spread, 0, -26 - spread) })
    .add('needle', needle(), { at: j.tx.move(0, 0, -30 - 3*spread) })
}
function swingSupportStudy(spread) {
  return j.assembly('Swing support bearing and pin study')
    .add('gate', gate(), { ground: true })
    .add('gatePin', gatePin(), { at: j.tx.move(0, spread, 0) })
    .add('bar', bar(), { at: j.tx.move(spread, 0, -15) })
    .add('driveBracket', driveBracket(), { at: j.tx.move(spread, 0, -15) })
}
// Local X follows the crank-pin to supporter-pin line. The eye
// coordinates are traced from the 02 s frame after normalizing that span.
const threadEye = [44, -23.7]
function takeUp() {
  const elbow = [leverLength, 0]
  const path = [origin, elbow, [28.8,-3.6], [36.9,-8.9], [41.8,-13.4],
    [43.9,-18.3], [44.7,-22]]
  let arm = circle(origin, 5.3)
  for (let i = 1; i < path.length; i++)
    arm = arm.union(j.region.slot(path[i-1], path[i], i === 1 ? 5.5 : 4.4))
  // Open inner edge for threading. A separate outer guard guides the thread.
  arm = arm.union(circle(threadEye, 3))
    .subtract(circle(threadEye, 1.55))
    .subtract(j.region.slot([42,-20.6], threadEye, 1.05))
    .subtract(circle(origin, 2.15)).subtract(circle(elbow, 1.6))
  return metal('A32 thread take-up lever · 416543101', '#a7adb0')
    .extrude(face(arm, 8), mm(2), { id: 'bentLever' })
    .extrude(face(circle(origin, 4.8).subtract(circle(origin, 2.15)), 7),
      mm(1), { id: 'crankBoss' })
    .port('pin', planar(origin)).port('support', planar(elbow))
    .port('eye', planar(threadEye))
}
function eyeGuard() {
  const guard = j.region.slot([47.6,-12], [46,-24], 1.8)
    .union(j.region.slot([46,-24], [44,-25.7], 1.8))
    .union(j.region.slot([44,-25.7], [42.1,-24.9], 1.8))
  return metal('Thread guide at eye of A32', '#c4cccc')
    .extrude(face(guard, 10), mm(0.85), { id: 'guard' })
    .port('mount', planar(origin))
}
function supporter() {
  const end = [rockerLength, 0]
  const web = j.region.slot(origin, end, 4.7)
    .union(circle(origin, 3.7)).union(circle(end, 3.2))
    .subtract(circle(origin, 1.55)).subtract(circle(end, 1.55))
  return metal('A33 take-up supporter · 416147701', '#aaa59b')
    .extrude(face(web, 10.2), mm(2.6), { id: 'waistedLink' })
    .extrude(face(circle(origin, 3.7).subtract(circle(origin, 1.55)), 8.5),
      mm(1.7), { id: 'bearingBoss' })
    .extrude(face(circle(end, 1.5), 7.8), mm(2.5), { id: 'jointPin' })
    .extrude(face(circle(end, 2).subtract(circle(end, 1.4)), 10.2),
      mm(0.6), { id: 'pinShoulder' })
    .port('start', planar(origin))
}
function supporterShaft() {
  return metal('A35 take-up supporter shaft', '#787f86')
    .extrude(face(circle(origin, 1.35), -12.15), mm(25.7), { id: 'core' })
    .extrude(face(circle(origin, 1.5), -11.55), mm(24.4), { id: 'journal' })
    .extrude(face(circle(origin, 1.5), 13.40), mm(0.15), { id: 'frontLip' })
    .extrude(face(circle(origin, 1.5), -12.15), mm(0.09), { id: 'rearLip' })
    .port('seat', planar(origin))
}
function retainer() {
  const clip = circle(origin, 2.7).subtract(circle(origin, 1.38))
    .subtract(j.region.slot([0,0], [3,0], 1.9))
  return metal('A34 supporter retaining clip · ETW-3', '#535b60')
    .extrude(face(clip, 0), mm(0.45), { id: 'openClip' })
    .port('seat', planar(origin))
}
function mountTakeUp(head) {
  const clip = retainer()
  return head.add('lever', takeUp()).add('rocker', supporter())
    .add('eyeGuard', eyeGuard()).add('supporterShaft', supporterShaft())
    .add('frontClip', clip).add('rearClip', clip)
    .joint('leverAngle', j.joint.revolute(), 'crank:pin', 'lever:pin')
    .joint('rockerAngle', j.joint.revolute(), 'head:anchor', 'rocker:start')
    .joint('guardSeat', j.joint.fixed(), 'lever:pin', 'eyeGuard:mount')
    .joint('shaftSeat', j.joint.fixed(), 'head:anchor', 'supporterShaft:seat')
    .joint('frontClipSeat', j.joint.fixed(), 'head:frontClip', 'frontClip:seat')
    .joint('rearClipSeat', j.joint.fixed(), 'head:rearClip', 'rearClip:seat')
}
function takeUpStudy(phase) {
  const q = pose(phase, 0)
  const head = j.assembly('Singer 44S take-up train')
    .add('head', frame(), { ground: true })
  return mountTakeUp(mountCrank(head)).params(takeUpAngles(phase, q))
}
function takeUpAngles(phase, q = pose(phase, 0)) {
  return { turn: deg(phase), leverAngle: deg(q.lever-phase),
    rockerAngle: deg(q.rocker) }
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
  if (mode === 'upper head') Object.assign(params, takeUpAngles(phase, q))
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
  head = addNeedleHardware(head)
  if (mode !== 'swing') {
    head = mountCrank(head)
      .add('rod', link('Needle connecting rod', rodLength, 5, '#939da5'))
      .joint('rodAngle', j.joint.revolute(), 'bar:drivePin', 'rod:start')
  }
  if (mode === 'upper head') head = mountTakeUp(head)
  return head.params(jointValues(mode, phase, swing))
}
// Service manual §3-5: at maximum width the needle rises 3–5 mm above
// the plate before it leaves the extreme lateral position. Choose 5 mm.
// The cam between these events is a smooth approximation.
function flowLaw(amplitude, clearance = 5) {
  function tipHeight(phase, swing) {
    return pose(phase, swing).stud[1] - 47 * Math.cos(radians(swing))
  }
  function crossing(swing, rising) {
    let lo = rising ? 0 : 180, hi = rising ? 180 : 360
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2
      if ((tipHeight(mid, swing) < clearance) === rising) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  const windows = [amplitude, -amplitude].map(a =>
    [crossing(a, true), crossing(-a, false)])
  function angle(phase) {
    const cycle = ((phase % 720) + 720) % 720
    const side = cycle < 360 ? 0 : 1
    const [start, end] = windows[side]
    const u = Math.max(0, Math.min(1, (cycle % 360 - start) / (end-start)))
    return (side ? -amplitude : amplitude) * Math.cos(Math.PI * u)
  }
  return { angle, windows }
}
// Convenience for the isolated drive and static swing presets.
const swingAt = (phase, amplitude) => flowLaw(amplitude).angle(phase)
return { takeUpStudy, takeUpAngles, needleHardwareStudy, swingSupportStudy,
  assemble, pose, flowLaw, swingAt, jointValues }
