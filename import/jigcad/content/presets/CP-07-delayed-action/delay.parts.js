// Local teaching datum. Dimensions and tooth counts are construction choices.
const brass = j.material('brass')
const steel = j.material('steel')
const first = [0, 0], star = [9.3, 0], anchor = [12, 1]
const lock = [12.5, 3], upperZ = 2.75
const disk = (point, r) => j.region.circle(r, { at: point })
const bar = (a, b, width) => j.region.slot(a, b, width)
const frame = ([x, y]) => j.frame({
  origin: j.pt(x, y, 0), x: j.dir('+X'), z: j.dir('+Z'),
})
const metal = (name, material, profile, z, thick) => j.part(name)
  .material(material).color(material === brass ? '#b09760' : '#839097')
  .extrude(profile.on(j.plane.offset(j.plane.XY, mm(z))), mm(thick),
    { id: 'profile' })
const wheel = (center, count, r, root, flank) => {
  const pts = []
  for (let i = 0; i < count; i++) {
    for (const [phase, radius] of [[0, root], [flank, r], [.9, root]]) {
      const a = (i + phase) * 2 * Math.PI / count
      pts.push([center[0] + radius * Math.cos(a),
        center[1] + radius * Math.sin(a)])
    }
  }
  return j.region.polygon(pts).subtract(disk(center, .38))
}
const fixing = [3.5, -1.95], rearFixing = [10.2, -1.95]
const plate = () => bar(first, [11.5, 0], 5.5)
  .union(disk(lock, .9)).union(bar([11.5, 0], lock, 1.5))
  .subtract(disk(first, .38)).subtract(disk(star, .38))
  .subtract(disk(anchor, .38)).subtract(disk(lock, .38))
  .subtract(disk(fixing, .27)).subtract(disk(rearFixing, .27))
const spring = () => {
  const inner = [], outer = []
  for (let i = 0; i <= 96; i++) {
    const a = 4.5 * Math.PI * i / 96, r = .74 + 1.18 * i / 96
    inner.push([(r - .07) * Math.cos(a), (r - .07) * Math.sin(a)])
    outer.push([(r + .07) * Math.cos(a), (r + .07) * Math.sin(a)])
  }
  return j.region.polygon([...outer, ...inner.reverse()])
}
return {
  lower: () => metal('Lower timer plate', brass, plate(), 0, .33)
    .port('input', frame(first)).port('star', frame(star))
    .port('anchor', frame(anchor)).port('lock', frame(lock)),
  pillars: () => metal('Timer plate distance pillars', brass,
    disk(fixing, .58).subtract(disk(fixing, .27))
      .union(disk(rearFixing, .58).subtract(disk(rearFixing, .27))),
    .33, upperZ - .33),
  screw: () => metal('Retaining screw, first gear end', steel,
    disk(fixing, .24), -.10, upperZ + .43)
    .extrude(disk(fixing, .56).on(j.plane.offset(j.plane.XY,
      mm(upperZ + .33))), mm(.24), { id: 'head' })
    .cut(bar([3.04, -1.95], [3.96, -1.95], .13)
      .on(j.plane.offset(j.plane.XY, mm(upperZ + .47))), mm(.14),
      { id: 'driverSlot' }),
  upper: () => metal('Upper plate, cut away', brass, plate()
    .subtract(bar([.7, .65], [11.2, .65], 3.5)), upperZ, .33),
  input: () => metal('First gear', brass, wheel(first, 30, 2.8, 2.5, .45),
    .5, .38).port('axis', frame(first)),
  ratchet: () => metal('Clutch notches', steel,
    wheel(first, 12, 1.85, 1.5, .78), .88, .35).port('axis', frame(first)),
  setting: () => metal('Slotted setting lever', steel,
    bar([-5.3, 0], first, 1.45).subtract(bar([-5.3, 0], [-4.3, 0], .75))
      .subtract(disk(first, .38)), 1.28, .28).port('axis', frame(first)),
  clutch: () => metal('One-way clutch spring', steel,
    bar([-2, 0], [-1.6, 1.25], .19).union(bar([-1.6, 1.25], [-.75, 1.5],
      .19)), 1.12, .16).port('axis', frame(first)),
  driveSpring: () => metal('Drive spring, plan representation', steel,
    spring(), 1.8, .45),
  star: () => metal('Escapement wheel', steel, wheel(star, 14, 1.85, 1.45, .7),
    .65, .35).port('axis', frame(star)),
  pallet: () => metal('Pallet', steel,
    bar([10.5, 1.45], anchor, .48).union(bar(anchor, [11, -.4], .48))
      .union(disk(anchor, .64)).subtract(disk(anchor, .38)),
    .67, .32).port('axis', frame(anchor)),
  locking: () => metal('Pallet locking lever', steel,
    bar(lock, [11.8, 1.3], .6).union(disk(lock, .64))
      .subtract(disk(lock, .38)), .7, .25).port('axis', frame(lock)),
}
