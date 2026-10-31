// H-13 · Spice-jar drawer insert: rows of jars lying down, lids up and
// towards you, each row higher than the one in front. Two modules, front
// and back, make four rows; both print on one plate.
// Notice the profile: one open zigzag, thickened by an offset into a
// sheet, and one part turned into two modules by its configs.
const TIERS = 2                        // rows of jars in one module
const front = i => `x0 + ${i} * p`     // x where row i of the module begins

// the top surface, front to back: up the front wall, then each row's
// slope falling back to its riser, and a stop behind the last row
const pts = [['x0', 0], ['x0', 'h0']]
for (let i = 0; i < TIERS; i++) {
  const top = `h0 + ${i} * rise`          // front edge of row i
  pts.push([front(i + 1), `${top} - d`])   // down the slope
  pts.push([front(i + 1),                  // up the riser, or the stop
    i < TIERS - 1 ? `${top} + rise` : `${top} - d + stop`])
}
const sheet = j.sketch('sheet', { on: j.plane.XZ })   // x back, z up
  .polyline('top', pts)
  .offset('under', ['top'], '-t')

// a leg under the foot of each slope, so the sheet stands on the drawer
let legs = j.sketch('legs', { on: j.plane.XZ })
for (let i = 1; i <= TIERS; i++) {   // a sketch is immutable: reassign it
  legs = legs.rect(`leg${i}`, 't', `h0 + ${i - 1} * rise - d`,
    { at: [`${front(i)} - t`, 0] })
}

const insert = j.part('spice-insert')
  .params({
    jar: mm(100),      // jar length, lid included: 50 g jars are 95–110
    a: deg(15),        // jars lie tilted 15°, lids up
    p: 'jar * cos(a)', // depth of one row
    d: 'p * tan(a)',   // how far each slope falls
    rise: mm(10),      // each row stands this much above the one in front
    x0: mm(0),         // where the module starts, front to back
    lift: mm(0),       // and how high its first row starts
    h0: 'lift + d + 4 mm',   // the module's front edge
    stop: mm(12),      // the back stop's height above the last slope
    t: lw(4),          // 1.8 mm sheet: four lines, solid
    W: mm(100),        // module width: two 45 mm jars side by side
  })
  // the back module sits behind the front one and two rows higher; the
  // top row's front edge is then 60 mm up, so its jars clear a drawer
  // 110 mm deep inside
  .configs({
    front: {},
    back: { x0: `${TIERS} * p`, lift: `${TIERS} * rise` },
  })
  .config('front')
  .expose(['jar', 'a', 'rise', 'W'], {
    labels: { jar: 'jar length', a: 'tilt', rise: 'step between rows',
      W: 'module width' },
    ranges: { jar: [mm(60), mm(115)], a: [deg(5), deg(30)],
      rise: [mm(5), mm(30)], W: [mm(50), mm(200)] },
  })
  .extrude(sheet.profiles(), { symmetric: 'W' }, { id: 'sheet' })
  .extrude(legs.profiles(), { symmetric: 'W' }, { id: 'legs' })

// On their sides: every layer is the whole zigzag and nothing overhangs.
// Print as many pairs as fill the drawer's width.
return j.print('spice-insert', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
}).add('front', insert).add('back', insert.config('back')).orient('+Y')
