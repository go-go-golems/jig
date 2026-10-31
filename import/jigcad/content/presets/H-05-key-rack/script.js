// H-05 · Key rack: a back plate with a row of pegs tilted up, hung on two
// screws through keyhole slots.
// Notice the pegs: one sketched and extruded, then repeated by a pattern
// whose count and step are params, so five pegs or eight is one number.
const x1 = '-(n - 1) * step / 2'     // x of the first peg

// one peg, seen from the side (sketch x is world Y, up the wall; sketch y
// is world Z, out of the wall), tilted up so keys slide back to the plate
const peg = j.sketch('peg', { on: j.plane.offset(j.plane.YZ, x1) })
  .polyline('p', [['py - peg_h / 2', 't - 1 mm'],
    ['py + peg_h / 2', 't - 1 mm'],
    ['py + peg_h / 2 + reach * tan(tilt)', 't + reach'],
    ['py - peg_h / 2 + reach * tan(tilt)', 't + reach']], { closed: true })

// a keyhole: the screw head goes in at the circle, the plate drops, and
// the shank rides up the slot
const keyhole = (x, grow = '0 mm') => j.region
  .circle(`head_d / 2 + ${grow}`, { at: [x, 'ky'] })
  .union(j.region.slot([x, 'ky'], [x, 'ky + drop'], `shank + 2 * ${grow}`))
const seat = x => keyhole(x, 'seat')

const rack = j.part('key-rack')
  .params({
    n: 5,                // pegs
    step: mm(30),        // peg to peg
    L: 'n * step + 10 mm',   // plate length follows the pegs
    H: mm(60),           // plate height
    t: mm(6),            // plate thickness
    r: mm(8),            // corner radius
    peg_h: mm(8), peg_w: mm(8),  // peg section
    reach: mm(30),       // how far a peg stands out
    tilt: deg(15),       // pegs rise 15° from horizontal
    head_d: mm(9),       // the keyhole's entry: a 4 mm screw's 8 mm head
    shank: mm(4.6),      // the slot the screw's shank rides in
    drop: mm(8),         // how far the plate drops onto the screws
    py: '-H / 2 + 20 mm',    // the pegs sit low on the plate
    ky: 'H / 2 - 24 mm',     // the keyholes above them
    kx: '(n - 2) * step / 2',    // and between the outer two pairs of pegs
    seat: mm(2),         // seat round the keyhole for the head
  })
  .expose(['n', 'step', 'reach', 'tilt'], {
    labels: { n: 'pegs', step: 'peg spacing', reach: 'peg length',
      tilt: 'peg tilt' },
    ranges: { n: [3, 8], step: [mm(20), mm(45)], reach: [mm(15), mm(45)],
      tilt: [deg(0), deg(30)] },
  })
  .extrude(j.region.rect('L', 'H', { r: 'r' }), 't', { id: 'plate' })
  .chamfer(j.feat('plate').startFace().edges(), mm(0.5), { id: 'foot' })
  .fillet(j.feat('plate').endFace().edges(), mm(2), { id: 'edge' })
  .extrude(peg.profiles(), { symmetric: 'peg_w' }, { id: 'peg' })
  .pattern(j.feat('peg'), j.pattern.linear(j.dir('+X'),
    { count: 'n', step: 'step' }), { id: 'pegs' })
  .cut(keyhole('-kx').union(keyhole('kx')), { through: 'all' },
    { id: 'keyholes' })
  // a seat round each keyhole at the back for a countersunk head, so the
  // plate lies flat on the wall: the keyhole grown by `seat`, cut up from
  // the bed with a taper that closes it to the keyhole's size; its walls
  // lean 40°, inside the 45° limit
  .cut(seat('-kx').union(seat('kx')), 'seat / tan(40 deg)',
    { taper: '-40 deg', id: 'seats' })

// Back-down: the pegs grow straight up, leaning 15°, and the keyhole seats
// open from the bed at 45°.
return j.print('key-rack', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [rack],
}).orient('+Z')
