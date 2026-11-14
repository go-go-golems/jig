// Interference over a study: the pinion turns through one tooth pitch (20°) and the wheel follows through the
// coupling; at every pose the teeth keep a gap. Half a wheel pitch out of phase (offset 0), they overlap all along.
const mod = mm(1)
const pinion = j.lib.gear.spur({ module: mod, teeth: 18, width: mm(4), name: 'pinion' })
const wheel = j.lib.gear.spur({ module: mod, teeth: 30, width: mm(4), name: 'wheel' })
const frame = j.part('frame')
  .extrude(j.sketch('b', { on: j.plane.offset(j.plane.XY, -4) }).rect('r', 80, 50, { center: true }).profiles(), mm(3), { id: 'plate' })
  .port('p', j.frame({ origin: j.pt(0, 0, 0), x: j.dir('+X'), z: j.dir('+Z') }))
  .port('w', j.frame({ origin: j.pt(24, 0, 0), x: j.dir('+X'), z: j.dir('+Z') }))
const phase = 6
return j.assembly('meshing')
  .add('frame', frame, { ground: true }).add('pinion', pinion).add('wheel', wheel)
  .joint('p', j.joint.revolute(), 'frame:p', 'pinion:axis')
  .joint('w', j.joint.revolute(), 'frame:w', 'wheel:axis')
  .couple(j.couple.gear('pinion', 'wheel', { offset: deg(phase) }))
  .drive('p', deg(10))
  .study('mesh', { drive: 'p', from: deg(10), to: deg(30), steps: 10 })
  .interference(['pinion', 'wheel'], { study: 'mesh' })
  .report('closest', s => s.studies.mesh.clearance('pinion', 'wheel').min.value, { unit: 'mm' })
