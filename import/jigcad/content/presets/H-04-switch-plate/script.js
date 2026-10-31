// H-04 · Light-switch cover plate: one script, three standards, chosen by
// config: an 86 × 86 mm Euro-module plate and two US single-gang plates.
// Notice the units: the US rows are written in inches, as the standard
// gives them, and the expressions convert.
const plate = j.part('switch-plate')
  .params({
    pw: mm(86), ph: mm(86),   // plate width and height
    r: mm(6),                 // corner radius
    depth: mm(7),             // the plate stands this far off the wall
    face: layer(12),          // 2.4 mm front
    rim: lw(4),               // 1.8 mm skirt round the back
    ow: mm(45), oh: mm(45),   // opening for the switch
    or: mm(1),                // opening corner radius
    sx: '60.3 mm / 2', sy: 0, // screw holes at (±sx, ±sy)
    screw_d: mm(4),           // clearance for the screw
    head_d: mm(7.4),          // countersunk head plus clearance
    sink: deg(90),            // metric countersunk heads are 90°
  })
  .configs({
    // UK and EU 86 × 86 mm box (BS 4662): M3.5 screws 60.3 mm apart, a
    // 45 × 45 mm Euro-module switch in the middle
    eu86: {},
    // US single gang, 2.75 × 4.5 in (NEMA WD 6): a Decora rocker opening,
    // 1.31 × 2.63 in, screws 3.281 in apart; #6-32 flat heads are 82°
    us_decora: { pw: '2.75 in', ph: '4.5 in', r: mm(2), ow: '1.31 in',
      oh: '2.63 in', sx: 0, sy: '3.281 in / 2', screw_d: mm(3.9),
      head_d: mm(7.2), sink: deg(82) },
    // US single gang for a toggle: 0.406 × 0.94 in, screws 2.375 in apart
    us_toggle: { pw: '2.75 in', ph: '4.5 in', r: mm(2), ow: '0.406 in',
      oh: '0.94 in', sx: 0, sy: '2.375 in / 2', screw_d: mm(3.9),
      head_d: mm(7.2), sink: deg(82) },
  })
  .config('eu86')
  .expose(['depth', 'r', 'face'], {
    labels: { depth: 'depth off the wall', r: 'corner radius',
      face: 'front thickness' },
    ranges: { depth: [mm(4), mm(12)], r: [mm(0.5), mm(15)],
      face: [mm(1.6), mm(4)] },
  })
  .extrude(j.region.rect('pw', 'ph', { r: 'r' }), 'depth', { id: 'body' })
  // modelled front-down, as it prints: z = 0 is the front, the back is
  // open
  .shell(j.feat('body').endFace(), 'rim', { id: 'skirt' })
  // the front edge is the bed edge: a chamfer steeper than 45°, 0.6 mm
  // across the front and 1.2 mm up the side
  .chamfer(j.feat('body').startFace().edges(), mm(1.2),
    { d2: mm(0.6), id: 'bevel' })
  .cut(j.region.rect('ow', 'oh', { r: 'or' }), { through: 'all' },
    { id: 'opening' })
  // countersunk from the front, which is the bed side
  .hole([j.pt('sx', 'sy', 0), j.pt('-sx', '-sy', 0)],
    j.hole.countersink(j.expr('screw_d'), j.expr('head_d'), j.expr('sink')),
    { id: 'screws' })

return j.print('switch-plate', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [plate],
}).orient('+Z')
