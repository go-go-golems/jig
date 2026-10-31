// W-03 · Drill guide: a block that holds a hand drill square to the work,
// one bore per drill size in drills.csv, with a V-groove underneath for
// centring on round stock. Notice that each bore is a hole feature sized
// by a fit class, so a 6 mm drill gets a 6.3 mm bore that prints round.
const drills = data.drills.rows          // label, d (mm)
const n = drills.length

// centre of bore k along X: the bores sit `web` apart, edge to edge
const xOf = k => `-L / 2 + ${k + 1} * web + ` +
  drills.slice(0, k).map(r => `${r.d} mm`).concat([`${drills[k].d} mm / 2`])
    .join(' + ')

const vee = j.sketch('vee', { on: j.plane.YZ })   // x is world Y, y world Z
  .polyline('v', [['-vee - 0.5 mm', '-0.5 mm'], ['vee + 0.5 mm', '-0.5 mm'],
    [0, 'vee']], { closed: true })

let guide = j.part('drill-guide')
  .params({
    web: mm(7),            // plastic between two bores
    L: `${drills.map(r => `${r.d} mm`).join(' + ')} + ${n + 1} * web`,
    D: mm(32),             // depth of the block
    H: mm(30),             // bore length: about four times the largest drill
    vee: mm(8),            // the V centres round stock up to 22 mm across
    fit: mm(0.1),          // documents the snug class the bores use
    text: mm(4),           // cap height of the sizes
  })
  .expose(['web', 'D', 'H', 'vee'], {
    labels: {
      web: 'web between bores', D: 'depth of the block',
      H: 'height of the block', vee: 'depth of the V-groove',
    },
    ranges: {
      web: [mm(4), mm(15)], D: [mm(20), mm(50)], H: [mm(15), mm(60)],
      vee: [mm(0), mm(12)],
    },
  })
  .extrude(j.sketch('base', { on: j.plane.XY })
    .rect('r', 'L', 'D', { center: true, r: mm(3) }).profiles(),
  'H', { id: 'body' })
  .cut(vee.profiles(), { symmetric: 'L + 2 mm' }, { id: 'groove' })

// one hole feature per drill: snug fit, with a 1 mm 90° lead-in at the top;
// a 3D point on the top face, so the position can be an expression
drills.forEach((r, k) => {
  guide = guide.hole([j.pt(xOf(k), 0, 'H')], j.hole.countersink(
    j.fit.hole(mm(r.d), 'snug'), mm(r.d + 2), deg(90), 'through'),
  { id: `bore-${r.label}` })
})

// The sizes, engraved 0.6 mm deep in front of their bores, one text region
// each: a region with `at` is placed where it says on the face.
const top = j.feat('body').endFace().largest()
drills.forEach((r, k) => {
  guide = guide.emboss(j.region.text(r.label, {
    size: 'text', align: 'center', valign: 'middle',
    at: [xOf(k), '-D / 2 + 5 mm'],
  }), mm(0.6), { on: top, op: 'cut', id: `size-${r.label}` })
})
guide = guide
  // the bed edges, but not the groove's: a chamfer there would be flatter
  // than its 45° sides
  .chamfer(j.feat('body').startFace().edges().minus(j.feat('groove').edges()),
    mm(0.5), { id: 'foot' })

// Upright: every bore is vertical, so it prints round and true; the
// V-groove's sides face the bed at 45°.
return j.print('drill-guide', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [guide],
}).orient('+Z').use(j.rules.fdm)
