const hinge = j.frame({
  origin: j.pt(0, 0, 0), x: j.dir('+X'), z: j.dir('+Z'),
})
const baseOutline = j.sketch('outline', { on: j.plane.offset(j.plane.XY, -5) })
  .rect('pad', 22, 22, { center: true })
const base = j.part('Base')
  .extrude(baseOutline.profiles(), mm(5), { id: 'pad' })
  .port('pivot', hinge)
const armOutline = j.sketch('outline', { on: j.plane.XY })
  .rect('bar', 70, 10, { at: [25, 0], center: true })
const arm = j.part('Arm').material(j.material('aluminium'))
  .extrude(armOutline.profiles(), mm(5), { id: 'bar' })
  .port('pivot', hinge)
  .port('tip', j.frame({
    origin: j.pt(55, 0, 2.5), x: j.dir('+X'), z: j.dir('+Z'),
  }))

return j.assembly('Driven arm')
  .add('base', base, { ground: true })
  .add('arm', arm)
  .joint('hinge', j.joint.revolute(), 'base:pivot', 'arm:pivot')
  .drive('hinge', deg(30))
  .speed('hinge', turn(120).div(minute(1)))
  .gravity('-Y')
  .wrench('arm:tip', [0, N(-2), 0], { label: 'tip load' })
  .study('sweep', { drive: 'hinge', from: deg(0), to: deg(360), steps: 72 })
  .reactions('sweep')
  .report('peak hinge force', s => s.studies.sweep.extrema['F:hinge'].max.value,
    { unit: 'N' })
  .report('drive torque at 0°', s => s.studies.sweep.at('T:hinge', 0),
    { unit: 'N·mm' })
