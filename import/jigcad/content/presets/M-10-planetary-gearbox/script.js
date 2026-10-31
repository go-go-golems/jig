// M-10 · Planetary gearbox: a sun, three planets and a ring, 4:1 from the
// sun's knob to the carrier. Notice the tooth counts: a ring must have
// z_sun + 2 z_planet teeth, and three planets fit evenly only when
// (z_sun + z_ring) / 3 is a whole number. The script checks both.
const zs = 18, zp = 18, n = 3
const zr = zs + 2 * zp                       // 54
if ((zs + zr) % n) throw new Error(`${n} planets do not fit: ` +
  `(${zs} + ${zr}) / ${n} is not a whole number`)
// Ring fixed, sun in, carrier out: 1 + zr / zs = 4 turns of the sun for one
// of the carrier.

const modul = mm(1.5), w = 8
const pin = mm(5)
const bore = j.hole.simple(j.fit.hole(pin, 'free'))
const sunGear = j.lib.gear.spur({ module: modul, teeth: zs, width: mm(w) })
const planet = j.lib.gear.spur({ module: modul, teeth: zp, width: mm(w) })
  .hole([[0, 0]], bore, { id: 'bore' })
// The ring is printed as it comes from the library and pressed into the
// base: any boolean on a 54-tooth ring costs seconds in this engine.
const ring = j.lib.gear.internal({ module: modul, teeth: zr,
  width: mm(w + 0.4), rim: mm(4) })

// Sun to planet and planet to ring must give the same centre distance:
// m (zs + zp) / 2 = m (zr − zp) / 2 = 27 mm.
const inner = j.inspect.gearMesh(sunGear, planet)
const outer = j.inspect.gearMesh(planet, ring)
if (!inner.ok || !outer.ok) throw new Error([...inner.messages,
  ...outer.messages].join('; '))
const a = inner.centreDistance.value
if (Math.abs(outer.centreDistance.value - a) > 1e-6)
  throw new Error('sun–planet and planet–ring centre distances differ')

// Heights: the ring stands on z = 0, the gears from 0.2 to 8.2, the
// carrier plate from 8.6 to 11.6, the sun's knob from 12.
const zc = w + 0.6, D = 2 * ring.meta.sets.gear.outerRadius   // Ø92.75
const up = j.dir('+Z'), east = j.dir('+X')

// The base: a 7 mm disc with a 4 mm recess the ring presses into (a snug
// fit), and an axle for the sun.
const base = j.part('base')
  .extrude(j.region.circle(D / 2 + 3).on(j.plane.offset(j.plane.XY, -3)),
    mm(7), { id: 'disc' })
  .hole([[0, 0]], j.hole.simple(j.fit.hole(mm(D), 'snug'), mm(4)),
    { id: 'recess' })
  .extrude(j.region.circle(pin.value / 2), mm(w - 0.4), { id: 'axle' })
  .chamfer(j.feat('disc').startFace().edges(), mm(0.6), { id: 'foot' })
  .port('sun', j.frame({ origin: j.pt(0, 0, 0.2), x: east, z: up }))
  .port('carrier', j.frame({ origin: j.pt(0, 0, zc), x: east, z: up }))

// The sun: a hub up through the carrier, a knob whose underside is a 45°
// cone (it prints standing on the gear), and a blind bore for the axle.
const zk = zc + 3.4
const sun = sunGear
  .extrude(j.region.circle(5).on(j.plane.offset(j.plane.XY, w)),
    mm(zk - w), { id: 'hub' })
  .revolve(j.sketch('knob', { on: j.plane.XZ }).polyline('half', [
    [0, zk], [5, zk], [9, zk + 4], [9, zk + 8], [0, zk + 8],
  ], { closed: true }).profiles(), j.axis.Z, turn(1), { id: 'knob' })
  .hole([j.pt(0, 0, 0)], j.hole.simple(j.fit.hole(pin, 'free'), mm(w - 0.4)),
    { id: 'bore' })

// The carrier: a hub and three arms carrying the planet pins (you can see
// the planets between the arms), a hole for the sun's hub and a notch in
// one arm to watch the output turn. It prints arms down, pins up. Its ports
// put each planet 0.2 mm above the base.
const spots = Array.from({ length: n }, (_, i) => {
  const t = 2 * Math.PI * i / n
  return [a * Math.cos(t), a * Math.sin(t)]
})
const deck = j.plane.offset(j.plane.XY, zc)
let carrier = j.part('carrier')
  .extrude(j.region.circle(12).on(deck), mm(3), { id: 'hub' })
  .extrude(j.region.slot([0, 0], [a, 0], 12).on(deck), mm(3), { id: 'arm' })
  .pattern(j.feat('arm'), j.pattern.circular(j.axis.Z, { count: n }),
    { id: 'arms' })
  .extrude(spots.map(([x, y]) => j.region.circle(pin.value / 2, { at: [x, y] }))
    .reduce((p, q) => p.union(q)).on(j.plane.offset(j.plane.XY, 0.6)),
  mm(zc - 0.6), { id: 'pins' })
  .hole([[0, 0]], j.hole.simple(j.fit.hole(mm(10), 'free')), { id: 'hubHole' })
  .cut(j.region.rect(6, 6, { at: [a + 6, 0] })
    .on(j.plane.offset(j.plane.XY, zc + 3)), mm(3), { id: 'notch' })
  .port('centre', j.frame({ origin: j.pt(0, 0, zc), x: east, z: up }))
spots.forEach(([x, y], i) => {
  carrier = carrier.port(`p${i + 1}`, j.frame({ origin: j.pt(x, y, 0.2),
    x: east, z: up }))
})

// The assembly. The sun has a tooth pointing at every planet, so each
// planet turns 10° (half a tooth) to show it a gap; the ring turns
// 180° / 54 to show each planet a tooth.
let box = j.assembly('planetary')
  .params({ planet1: deg(10), planet2: deg(10), planet3: deg(10) })
  .add('base', base, { ground: true })
  .add('ring', ring, { at: j.tx.rotate(j.axis.Z, deg(180 / zr)) })
  .add('sun', sun).add('carrier', carrier)
  .joint('sun', j.joint.revolute(), 'base:sun', 'sun:axis')
  .joint('carrier', j.joint.revolute(), 'base:carrier', 'carrier:centre')
spots.forEach((s, i) => {
  box = box.add(`planet${i + 1}`, planet)
    .joint(`planet${i + 1}`, j.joint.revolute(), `carrier:p${i + 1}`,
      `planet${i + 1}:axis`)
})

// The print job: seven parts, all flat. Not the default, because slicing
// involute flanks is slow in this engine; set printJob to true.
const printJob = false
const job = j.print('planetary', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
}).add('base', base).add('ring', ring).add('sun', sun)
  .add('carrier', carrier, { orient: '-Z' }).add('planet', planet, { qty: n })
return printJob ? job : box
