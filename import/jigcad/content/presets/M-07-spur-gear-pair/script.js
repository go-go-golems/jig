// M-07 · Spur gear pair: an 18-tooth pinion driving a 36-tooth wheel on a
// base whose two pegs stand exactly one centre distance apart. Notice that
// the distance is not typed in: j.inspect.gearMesh computes it from the two
// gears, and the base is built from that number.
const modul = mm(2), width = mm(8)
const peg = mm(5)                        // printed axles
const bore = j.hole.simple(j.fit.hole(peg, 'free'))
const pinion = j.lib.gear.spur({ module: modul, teeth: 18, width })
  .hole([[0, 0]], bore, { id: 'bore' })
const wheel = j.lib.gear.spur({ module: modul, teeth: 36, width })
  .hole([[0, 0]], bore, { id: 'bore' })

// The check: same module and pressure angle, contact ratio over 1.1, no
// undercut (18 teeth is above the 17 where 20° teeth start to undercut).
const mesh = j.inspect.gearMesh(pinion, wheel)
if (!mesh.ok) throw new Error(`gears do not mesh: ${mesh.messages.join('; ')}`)
const a = mesh.centreDistance.value     // m (z1 + z2) / 2 = 54 mm

// The base: a bar with round ends from axle to axle, a 0.6 mm spacer round
// each peg so the gears clear the bar, the pegs, and a port on each axle
// 0.2 mm above its spacer, where a gear's `axis` port goes.
const axles = (id, r) => j.sketch(id, { on: j.plane.offset(j.plane.XY, 4) })
  .circle('p1', r).circle('p2', r, { at: [a, 0] })
const axle = x => j.frame({ origin: j.pt(x, 0, 4.8), x: j.dir('+X'),
  z: j.dir('+Z') })
const base = j.part('base')
  .params({ bar: mm(16), plate: mm(4), pegH: mm(14) })
  .extrude(j.region.slot([0, 0], [a, 0], 16), 'plate', { id: 'bar' })
  .extrude(axles('spacers', mm(5)).profiles(), mm(0.6), { id: 'spacers' })
  .extrude(axles('pegs', peg.value / 2).profiles(), 'pegH', { id: 'pegs' })
  .chamfer(j.feat('pegs').endFace().edges(), mm(0.5), { id: 'tips' })
  .port('axle1', axle(0)).port('axle2', axle(a))

// The pair, assembled: each gear on a revolute joint. The wheel's joint
// starts at 5°, half a tooth, so a pinion tooth sits in a wheel gap.
// .interference() measures the smallest gap between every two parts.
const pair = j.assembly('gear-pair')
  .params({ wheel: deg(180 / 36) })
  .add('base', base, { ground: true })
  .add('pinion', pinion).add('wheel', wheel)
  .joint('pinion', j.joint.revolute(), 'base:axle1', 'pinion:axis')
  .joint('wheel', j.joint.revolute(), 'base:axle2', 'wheel:axis')
  .interference()

// The print job: all three flat, gears on a face so every tooth is a
// vertical prism. It is not the default because slicing involute flanks
// takes about a minute in this engine; set printJob to true to see it.
const printJob = false
const job = j.print('gear-pair', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
}).add('base', base).add('pinion', pinion).add('wheel', wheel).orient('+Z')
return printJob ? job : pair
