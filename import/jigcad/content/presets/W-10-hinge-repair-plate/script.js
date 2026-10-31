// W-10 · Hinge repair plate: a plate that bridges a cupboard door whose
// concealed-hinge screws have torn out of the chipboard. The hinge's 35 mm
// cup passes through it into the old bore, its screws bite into the plate,
// and four countersunk screws hold the plate in sound wood further out.
// Notice the boring pattern: the hinge screws' spacing `a` and their offset
// `b` from the cup come from a table of the common patterns.
// Patterns (a / b, mm): 45/9.5 (Blum), 48/6 (Hettich, Salice), 52/5.5.
// Plan on XY: the door's edge runs along X at y = 0, its face is z = 0.
const patterns = j.table([data.hinges.columns, ...data.hinges.rows
  .map(r => data.hinges.columns.map(c => String(r[c])))])

const plate = j.part('hinge-repair-plate')
  .params({
    a: mm(48), b: mm(6),   // from the table
    cup: mm(35),           // the hinge cup
    C: mm(4),              // boring distance: door edge to the cup's edge
    e: 'cup / 2 + C',      // door edge to the cup's centre: 21.5 mm
    W: mm(96),             // length along the edge
    D: 'e + b + 24 mm',    // depth from the edge
    t: mm(4),              // thickness
    pilot: mm(2.5),        // for the hinge's own 3.5 mm chipboard screws
    fix_x: 'W / 2 - 8 mm', // the four fixing screws
  })
  .configs(patterns)       // 45/9.5, 48/6, 52/5.5; with none chosen, 48/6
  .expose(['C', 'W', 't'], {
    labels: { C: 'boring distance', W: 'length along the edge',
      t: 'thickness' },
    ranges: { C: [mm(3), mm(7)], W: [mm(80), mm(130)], t: [mm(3), mm(6)] },
  })
  .extrude(j.sketch('outline', { on: j.plane.XY })
    .rect('r', 'W', 'D', { center: true, at: [0, 'D / 2'], r: mm(6) })
    .profiles(), 't', { id: 'body' })
  // the cup passes through into the door's old bore, with the free gap
  .hole([j.pt(0, 'e', 't')], j.hole.simple(j.fit.hole('cup', 'free')),
    { id: 'cup' })
  // the hinge's own screws, on the boring pattern
  .hole([j.pt('-a / 2', 'e + b', 't'), j.pt('a / 2', 'e + b', 't')],
    j.hole.simple('pilot'), { id: 'hinge-screws' })
  // four countersunk screws into sound wood: two along the edge beyond the
  // cup, two at the back
  .hole([j.pt('-fix_x', mm(8), 't'), j.pt('fix_x', mm(8), 't'),
    j.pt('-fix_x', 'D - 8 mm', 't'), j.pt('fix_x', 'D - 8 mm', 't')],
  j.hole.countersink('M4', { fit: 'free' }), { id: 'fixing' })
  .chamfer(j.feat('body').endFace().edges().minus(j.feat('cup').edges())
    .minus(j.feat('hinge-screws').edges()).minus(j.feat('fixing').edges()),
  mm(1), { id: 'ease' })

// Flat, the door side on the bed: every hole is vertical and round, and the
// countersinks open upwards.
return j.print('hinge-repair-plate', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [plate],
}).orient('+Z').use(j.rules.fdm)
