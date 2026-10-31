// H-01 · Plant pot and saucer: a tapered pot with drainage holes, and a
// ribbed saucer for it to stand in. Two parts, one plate.
// Notice the shared params: the saucer is sized from the pot, so a change
// to the pot's base changes both, and a config changes all of them.
const P = {
  top_d: mm(115),     // outside diameter at the rim
  base_d: mm(85),     // outside diameter at the base
  h: mm(100),         // pot height
  wall: lw(4),        // 1.8 mm: four lines, watertight in PETG
  drain_d: mm(6),     // drainage holes: big enough not to clog with soil
  drain_r: '0.3 * base_d',    // radius of the ring of outer holes
  margin: mm(6),      // room round the pot's base inside the saucer
  rib: mm(3),         // the pot stands on ribs, so the holes never seal
  rib_w: lw(4),
  sh: mm(16),         // saucer height
  flare: deg(30),     // the saucer's sides, from vertical
  sd: 'base_d + 2 * margin',   // the saucer's floor
}
const sizes = {
  S: { top_d: mm(90), base_d: mm(70), h: mm(80), sh: mm(14) },
  M: {},
  L: { top_d: mm(150), base_d: mm(115), h: mm(130), sh: mm(18),
    wall: lw(5) },
}
const expose = (part, names) => part.expose(names, {
  labels: { top_d: 'rim diameter', base_d: 'base diameter', h: 'height',
    drain_d: 'drain hole size', sh: 'saucer height' },
  ranges: { top_d: [mm(60), mm(180)], base_d: [mm(50), mm(150)],
    h: [mm(50), mm(180)], drain_d: [mm(3), mm(12)], sh: [mm(8), mm(30)] },
})

// The pot: a frustum turned about Z, hollowed with its top face open.
// It is modelled where it sits, on the saucer's ribs.
const z0 = 'wall + rib'
const potSection = j.sketch('pot', { on: j.plane.XZ })
  .polyline('p', [[0, z0], ['base_d / 2', z0], ['top_d / 2', `${z0} + h`],
    [0, `${z0} + h`]], { closed: true })
const pot = expose(j.part('pot').params(P).configs(sizes).config('M'),
    ['top_d', 'base_d', 'h', 'drain_d'])
  .revolve(potSection.profiles(), j.axis.Z, turn(1), { id: 'body' })
  .shell(j.feat('body').sideFace('p.3'), 'wall', { id: 'hollow' })
  // one hole in the middle and three round it, at 90°, 210° and 330°:
  // between the saucer's ribs, which run at every 60° from 0°. Drilled
  // from the inside floor straight down.
  .hole([[0, 0], [0, 'drain_r'], ['-drain_r * cos(30 deg)', '-drain_r / 2'],
    ['drain_r * cos(30 deg)', '-drain_r / 2']]
    .map(([x, y]) => j.pt(x, y, `${z0} + wall`)),
    j.hole.simple('drain_d'), { id: 'drain' })
  .fillet(j.feat('body').sideFace('p.3').edges(), mm(0.8), { id: 'rim' })
  // the side flares out, so the foot chamfer is steeper than 45°
  .chamfer(j.feat('body').sideFace('p.1').edges('%circle').largest(),
    mm(0.8), { d2: mm(0.5), id: 'foot' })

// The saucer: a shallow dish with sloping sides, and six radial ribs on
// its floor that hold the pot clear of the water.
const saucerSection = j.sketch('saucer', { on: j.plane.XZ })
  .polyline('p', [[0, 0], ['sd / 2', 0], ['sd / 2 + sh * tan(flare)', 'sh'],
    [0, 'sh']], { closed: true })
const ribs = j.sketch('ribs', { on: j.plane.offset(j.plane.XY, 'wall') })
  .rect('r', 'base_d / 2 - 12 mm', 'rib_w', { at: ['10 mm', '-rib_w / 2'] })
  .pattern(['r'], j.pattern.circular(j.axis.Z, { count: 6 }))
const saucer = expose(j.part('saucer').params(P).configs(sizes).config('M'),
    ['base_d', 'sh'])
  .revolve(saucerSection.profiles(), j.axis.Z, turn(1), { id: 'dish' })
  .shell(j.feat('dish').sideFace('p.3'), 'wall', { id: 'hollow' })
  .extrude(ribs.profiles(), 'rib', { id: 'ribs' })
  // the sides lean 30°, so the chamfer runs 1 mm up the side and only
  // 0.25 mm in under the base: steeper than 45°
  .chamfer(j.feat('dish').sideFace('p.1').edges(), mm(0.25),
    { d2: mm(1), id: 'foot' })

// Both upright: the pot's 8.5° taper and the saucer's 30° sides print
// without support. PETG, because it lives with wet soil.
return j.print('plant-pot', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [pot, saucer],
}).orient('+Z')
