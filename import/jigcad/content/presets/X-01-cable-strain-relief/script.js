// X-01 · Cable strain relief: a two-part clamp that grips a cable where it
// leaves a box or a bench, so a tug pulls on the clamp and not on the
// solder joints. Notice the groove: smaller than the cable by `squeeze`,
// and the two halves stop `gap` apart, so tightening the screws squeezes
// the cable instead of closing the halves on each other.
// Base and cap are two bodies of one part, both groove up as they print,
// the cap `L + 8 mm` along X from the base; the cable runs along X.
const P = {
  cable: mm(6),            // cable diameter: USB and DC leads are 3–7 mm
  squeeze: mm(0.6),        // the groove is this much under the cable
  gap: mm(1),              // between the two halves when clamped
  rib: mm(0.4),            // ribs stand this far into the groove
  L: mm(24),               // length along the cable
  h: mm(6),                // thickness of each half
  rc: '(cable - squeeze) / 2',      // groove radius between the ribs
  zc: 'h + gap / 2',                // the cable's axis, above each half
  screw_y: 'rc + 5 mm',             // the clamp screws, either side
  W: '2 * screw_y + 9 mm',          // width of the cap
  cap_x: 'L + 8 mm',                // where the cap lies on the plate
}

// A half centred at x0: a block, a groove along X with the ribs left
// standing between three wider relief cuts.
const half = (part, name, x0, width) => part
  .extrude(j.sketch(`${name}-block`, { on: j.plane.XY })
    .rect('r', 'L', width, { center: true, at: [x0, 0], r: mm(2) })
    .profiles(), 'h', { id: `${name}-block` })
  .cut(j.sketch(`${name}-groove`,
    { on: j.plane.offset(j.plane.YZ, `${x0} - L / 2 - 1 mm`) })
    .circle('c', 'rc - rib', { at: [0, 'zc'] }).profiles(), 'L + 2 mm',
  { id: `${name}-groove` })
  .cut(j.sketch(`${name}-relief`,
    { on: j.plane.offset(j.plane.YZ, `${x0} - L / 2 + 2 mm`) })
    .circle('c', 'rc', { at: [0, 'zc'] }).profiles(), 'L / 5',
  { id: `${name}-relief` })
  .pattern(j.feat(`${name}-relief`), j.pattern.linear(j.dir('+X'),
    { count: 3, step: '(L - 4 mm - L / 5) / 2' }), { id: `${name}-reliefs` })

let clamp = j.part('strain-relief')
  .params(P)
  .expose(['cable', 'squeeze', 'L'], {
    labels: { cable: 'cable diameter', squeeze: 'squeeze on the cable',
      L: 'length along the cable' },
    ranges: { cable: [mm(2), mm(12)], squeeze: [mm(0), mm(1.5)],
      L: [mm(12), mm(40)] },
  })
// The base carries two M3 nuts, trapped from underneath, and two
// countersunk holes for screwing it down.
clamp = half(clamp, 'base', '0 mm', 'W + 18 mm')
  .hole([j.pt(0, '-screw_y', 0), j.pt(0, 'screw_y', 0)],
    j.hole.nutTrap('M3', { from: 'top' }), { id: 'nuts' })
  .hole([j.pt(0, '-(W / 2 + 4.5 mm)', 'h'), j.pt(0, 'W / 2 + 4.5 mm', 'h')],
    j.hole.countersink('M3', { fit: 'free' }), { id: 'mount' })
// The cap is turned over onto the base in use; it has plain clearance
// holes over the nuts.
clamp = half(clamp, 'cap', 'cap_x', 'W')
  .hole([j.pt('cap_x', '-screw_y', 'h'), j.pt('cap_x', 'screw_y', 'h')],
    j.hole.clearance('M3', { fit: 'free' }), { id: 'screws' })

// Both groove up on one plate: a groove open at the top needs no support;
// the nut traps open onto the bed.
return j.print('strain-relief', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [clamp],
}).orient('+Z').use(j.rules.fdm)
