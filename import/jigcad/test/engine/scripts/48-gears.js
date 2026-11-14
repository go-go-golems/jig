// Gears as couplings: the joints that turn them are found, the ratio comes from the teeth (18:30) and its sign from
// the axes (an external mesh turns the pair in opposite senses); a rack moves 9 mm per radian, the pinion's pitch
// radius. The couples work on turned values, so the wheel does not jump when the pinion passes 180°.
const mod = mm(1)
const pinion = j.lib.gear.spur({ module: mod, teeth: 18, width: mm(4), name: 'pinion' })
const wheel = j.lib.gear.spur({ module: mod, teeth: 30, width: mm(4), name: 'wheel' })
const rack = j.lib.gear.rack({ module: mod, teeth: 12, width: mm(4), name: 'rack' })
  .port('run', { origin: [0, 0, 0], x: [0, 1, 0], z: [1, 0, 0] })              // slides along its pitch line
const frame = j.part('frame')
  .extrude(j.sketch('b', { on: j.plane.offset(j.plane.XY, -4) }).rect('r', 120, 70, { center: true }).profiles(), mm(3), { id: 'plate' })
  .port('p', j.frame({ origin: j.pt(0, 0, 0), x: j.dir('+X'), z: j.dir('+Z') }))
  .port('w', j.frame({ origin: j.pt(24, 0, 0), x: j.dir('+X'), z: j.dir('+Z') }))   // centre distance (18 + 30) / 2
  .port('r', j.frame({ origin: j.pt(-9, 15, 0), x: j.dir('+X'), z: j.dir('-Y') }))  // the rack's pitch line 9 mm left of the pinion
return j.assembly('gear train')
  .add('frame', frame, { ground: true }).add('pinion', pinion).add('wheel', wheel).add('rack', rack)
  .joint('p', j.joint.revolute(), 'frame:p', 'pinion:axis')
  .joint('w', j.joint.revolute(), 'frame:w', 'wheel:axis')
  .joint('r', j.joint.slider(), 'frame:r', 'rack:run')
  .couple(j.couple.gear('pinion', 'wheel', { offset: deg(6) }))
  .couple(j.couple.rack('rack', 'pinion'))
  .drive('p', deg(30))
  .measure('wheel', r => r.joint('w'))
  .measure('rack', r => r.joint('r'))
  .study('turn', { drive: 'p', from: deg(0), to: deg(360), steps: 72 })
  .report('wheel at 270°', s => s.studies.turn.at('wheel', 270), { unit: '°' })
