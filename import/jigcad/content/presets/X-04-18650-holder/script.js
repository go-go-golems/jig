// X-04 · 18650 holder: a tray for lithium-ion cells lying side by side,
// with slots at the ends of each bay for the sheet-metal contacts and a
// hole in the floor for each contact's solder tab. Cell sizes come from a
// table; 18650 is Ø18.6 × 65.2 mm (unprotected). Notice the bay: a
// cylinder cut whose axis is below the top, so the rim holds the cell, yet
// no part of the trough leans more than 17° from vertical.
const cells = j.table([data.cells.columns, ...data.cells.rows
  .map(r => data.cells.columns.map(c => String(r[c])))])

// one bay, cut along Y and patterned along X
const bay = j.sketch('bay', { on: j.plane.XZ })
  .circle('c', 'd / 2 + gap', { at: ['x0', 'zc'] })
// the contact slots and tab holes of the first bay, both ends
const slots = j.sketch('slots', { on: j.plane.offset(j.plane.XY, 'H') })
  .rect('a', 'contact_w', 'slot_t',
    { center: true, at: ['x0', 'Lb / 2 + slot_t / 2'] })
  .rect('b', 'contact_w', 'slot_t',
    { center: true, at: ['x0', '-Lb / 2 - slot_t / 2'] })
const tabs = j.sketch('tabs', { on: j.plane.XY })
  .rect('a', mm(4), mm(1.5), { center: true, at: ['x0', 'Lb / 2 - 0.5 mm'] })
  .rect('b', mm(4), mm(1.5), { center: true, at: ['x0', '-Lb / 2 + 0.5 mm'] })
const along = j.pattern.linear(j.dir('+X'), { count: 'n', step: 'pitch' })

const holder = j.part('cell-holder')
  .params({
    d: mm(18.6), l: mm(65.2),     // the cell (from the table)
    n: 2,                         // cells side by side
    gap: mm(0.3),                 // round the cell: the free class
    spring: mm(5),                // room for the spring contact, compressed
    Lb: 'l + spring',             // inside length of a bay
    web: mm(1.6),                 // between bays
    pitch: 'd + 2 * gap + web',
    floor: mm(1.6),
    zc: 'floor + d / 2 + gap',    // the cells' axis
    H: 'zc + 0.15 * d',           // the rim stands 0.15 d above the axis
    end: mm(6),                   // end walls, with a screw hole in each
    side: mm(2),
    W: 'n * pitch - web + 2 * side',
    D: 'Lb + 2 * end',
    x0: '-(n - 1) * pitch / 2',   // the first bay's centre
    contact_w: mm(12),            // sheet contacts are 10–11 mm wide
    slot_t: mm(0.8),              // slot for a 0.3–0.5 mm contact plate
  })
  .configs(cells)                 // 14500, 18650, 21700; the middle is active
  .expose(['n', 'd', 'l', 'spring'], {
    labels: { n: 'number of cells', d: 'cell diameter', l: 'cell length',
      spring: 'room for the spring' },
    ranges: { n: [1, 6], d: [mm(10), mm(26)], l: [mm(40), mm(80)],
      spring: [mm(2), mm(8)] },
  })
  .extrude(j.sketch('outline', { on: j.plane.XY })
    .rect('r', 'W', 'D', { center: true, r: mm(2) }).profiles(),
  'H', { id: 'body' })
  .cut(bay.profiles(), { symmetric: 'Lb' }, { id: 'bay' })
  .cut(slots.profiles(), '-(H - floor)', { id: 'slots' })
  .cut(tabs.profiles(), 'floor + 0.5 mm', { id: 'tabs' })
  .pattern([j.feat('bay'), j.feat('slots'), j.feat('tabs')], along,
    { id: 'bays' })
  // screw it down through the end walls, clear of the contact slots
  .hole([j.pt(0, 'Lb / 2 + end - 2.4 mm', 'H'),
    j.pt(0, '-Lb / 2 - end + 2.4 mm', 'H')],
  j.hole.clearance('M3', { fit: 'free' }), { id: 'mount' })
  // the bed edges of the outline only: edges both of the bottom face and of
  // the outline's sides (the tab holes and screw holes open there too)
  .chamfer(j.feat('body').startFace().edges()
    .and(j.feat('body').sideFaces().edges()), mm(0.5), { id: 'foot' })

// Upright: the troughs open upwards, the slots and tab holes are vertical.
return j.print('cell-holder', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [holder],
}).orient('+Z').use(j.rules.fdm)
