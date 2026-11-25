// Coordinates follow SG-03. (0,0,0) is the centered needle at the plate.
// +Y goes toward the back of the foot. Distances in mm are study estimates
// apart from the service gauge and the catalog fastener designations.
const barY = 22
const footGauge = 6.1
const metal = (name, color) => j.part(name).material(j.material('steel'))
  .color(color)
const circle = (r, at = [0, 0]) => j.region.circle(r, { at })
const ring = (outer, inner) => circle(outer).subtract(circle(inner))
const xy = (shape, z = 0) =>
  shape.on(j.plane.offset(j.plane.XY, mm(z)))
// YZ plane: profile coords are Y,Z; the extrusion proceeds in +X.
const yz = (shape, x = 0) =>
  shape.on(j.plane.offset(j.plane.YZ, mm(x)))
const plateSteel = '#859098', bright = '#c6c9cb'
function bearingGuide() {
  // Open-front surrogate for the head casting. The two bar guides are coaxial.
  const bearing = ring(5, 2.62)
  return metal('Presser bar bearing reference', '#667680')
    .extrude(xy(bearing, 24), mm(6), { id: 'lowerGuide' })
    .extrude(xy(j.region.rect(5, 3, { at: [0, 5] }), 24),
      mm(20), { id: 'rearWeb' })
    .extrude(xy(bearing, 38), mm(6), { id: 'upperGuide' })
}
function bar() {
  return metal('Presser bar E40', bright)
    .extrude(xy(circle(2.5), 14), mm(55), { id: 'groundShaft' })
    .cut(yz(circle(1.80, [0, 17]), -4), mm(8), { id: 'shankScrewBore' })
}
function collar() {
  const tab = j.region.slot([0, 0], [6, 0], 7).subtract(circle(2.54))
  return metal('Presser bar bracket E43', plateSteel)
    .extrude(xy(tab, 50), mm(7), { id: 'liftingToe' })
    .cut(yz(circle(2.5, [0, 53.5]), -1), mm(12), { id: 'setScrewBore' })
}
function spring(height) {
  // Centreline seats rise by one wire radius so the end wire contacts both
  // seats. The assembly is rebuilt at the specified lift before sampling.
  const turns = 8, r = 3.75, wire = 0.62
  const pitch = (height - 2 * wire) / turns
  const path = j.sketch3d('coilPath').helix('coil', {
    pitch: mm(pitch), turns, r: mm(r),
  })
  const wireProfile = j.sketch('wire', { on: j.plane.XZ })
    .circle('section', mm(wire), { at: [r, 0] }).profiles()
  return metal('Presser bar spring E45', '#73777c')
    .sweep(wireProfile, path, { frame: 'frenet', id: 'helix' })
}
function regulator() {
  return metal('Pressure regulating screw E49', '#999ea3')
    .extrude(xy(ring(4.8, 2.6), 81), mm(6.5), { id: 'pressureSeat' })
    .extrude(xy(ring(6, 2.6), 87.5), mm(3), { id: 'adjustingHead' })
    .cut(xy(j.region.rect(13, 1.5), 89.4), mm(2), { id: 'toolSlot' })
}
function lever(lift) {
  const arm = 11.5, angle = -Math.asin(lift / arm)
  const point = ([y,z]) => [
    y * Math.cos(angle) - z * Math.sin(angle),
    y * Math.sin(angle) + z * Math.cos(angle),
  ]
  const toe = point([-arm,0]), knee = point([8,-1])
  const handle = point([16,-15])
  const web = j.region.slot(toe, [0,0], 4)
    .union(j.region.slot([0,0], knee, 6))
    .union(j.region.slot(knee, handle, 5))
    .union(circle(4)).subtract(circle(2.05))
  return metal('Presser bar lifter lever E37', '#655e54')
    .extrude(yz(web, 4.5), mm(2.2), { id: 'lifter' })
}
function shoulderScrew(name, stemRadius, length, headRadius, headThickness) {
  return metal(name, bright)
    .extrude(yz(circle(stemRadius), -length), mm(length), { id: 'stem' })
    .extrude(yz(circle(headRadius)), mm(headThickness), { id: 'head' })
    .cut(yz(j.region.rect(2.2 * headRadius, 0.75), headThickness - 0.6),
      mm(1), { id: 'slot' })
}
function shank() {
  // The shank is clamped beside the bar and snaps over the foot cross-pin.
  const cheek = j.region.slot([1,5.2], [0,17], 5.6)
    .subtract(circle(1.85, [0,17]))
    .subtract(circle(1, [1,5.2]))
    .subtract(j.region.rect(1.35,3, { at: [1,3.6] }))
  return metal('Snap-on shank E46', plateSteel)
    .extrude(yz(cheek, 2.55), mm(2.4), { id: 'shank' })
}
function foot() {
  // Coordinates here refer to the needle, independent of the bar axis.
  const sole = j.region.polygon([
    [-7,-8],[7,-8],[7,barY+2],
    [5.4,barY+4],[-5.4,barY+4],[-7,barY+2],
  ]).subtract(j.region.slot([-3.8,0],[3.8,0],2.5))
    .subtract(j.region.rect(1.7,16,{at:[1,-8]}))
  // Raised toes enter the fabric from the front. Their widths
  // and bent leading edges are estimated from the low oblique photograph.
  const toe = j.region.polygon([
    [-15,2.8],[-12,1],[-8,0],[-7,0],[-7,1.35],
    [-8,1.35],[-12,2.35],[-15,4.15],
  ])
  const upright = circle(2.2,[barY+1,5.2])
    .union(j.region.rect(4.4,4.5,{at:[barY+1,2.9]}))
  return metal('Zigzag presser foot C E48', bright)
    .extrude(xy(sole), mm(1.35), { id: 'slottedSole' })
    .extrude(yz(toe,-6.6), mm(6.7), { id: 'leftSkiToe' })
    .extrude(yz(toe,1.9), mm(4.7), { id: 'rightSkiToe' })
    .extrude(yz(upright,-6.8), mm(1.25), { id: 'leftEar' })
    .extrude(yz(upright,5.55), mm(1.25), { id: 'rightEar' })
    .extrude(yz(circle(0.95,[barY+1,5.2]),-6),
      mm(12), { id: 'snapPin' })
}
function mount(assembly, lift = 0) {
  if (!Number.isFinite(lift) || lift < 0 || lift > 6.2)
    throw Error('Presser lift must be between 0 and 6.2 mm.')
  // Each spatial placement stays fixed through a stitch cycle. Changing the
  // hand-lifter setting rebuilds the compressed spring and lifter geometry.
  const at = (x, y, z) => ({ at: j.tx.move(x,y,z) })
  return assembly
    .add('presserGuide', bearingGuide(), at(0,barY,0))
    .add('presserBar', bar(), at(0,barY,lift))
    .add('presserBracket', collar(), at(0,barY,lift))
    .add('presserClampScrew', shoulderScrew('Bracket set screw E44',
      2.45,5,2.45,0.8), at(7.5,barY,53.5+lift))
    .add('presserSpring', spring(24-lift), at(0,barY,57+lift+0.62))
    .add('presserAdjuster', regulator(), at(0,barY,0))
    .add('presserLifter', lever(lift), at(0,barY+11.5,48))
    .add('presserPivotScrew', shoulderScrew('Lifter pivot screw E39',
      1.95,10,3.7,2.4), at(6.9,barY+11.5,48))
    .add('presserShank', shank(), at(0,barY,lift))
    .add('presserShankScrew', shoulderScrew('Shank screw E47',
      1.75,7.5,3.7,1.7), at(5,barY,17+lift))
    .add('presserFoot', foot(), at(0,0,lift))
}
return { mount, footGauge }
