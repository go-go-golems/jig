// C-04 · Print-in-place clearance: ten captive rotors, gaps 0.15 to 0.60 mm.
// Notice that the holes are all alike (two hole features drill all ten);
// only the rotors differ, each its own revolve offset by its gap.
const lo = 0.15, hi = 0.6, steps = 10, cols = 5
const gaps = Array.from({ length: steps },
  (_, i) => +(lo + (hi - lo) * i / (steps - 1)).toFixed(3))
// Rotor i sits at cell(i) on a 15 mm grid. The pitch is a number, not a
// param: a revolve axis through points given as expressions comes out wrong
// in this engine, so the axes are placed with numbers.
const pitch = 15
const cell = i =>
  [(i % cols + 0.5) * pitch, (Math.floor(i / cols) + 0.5) * pitch]

// The hole is an hourglass: a 45° cone from Ø(d + 2c) at each face to the
// Ø d waist. A rotor is that shape shrunk by its gap g, measured square to
// every face: 45° faces move g·√2 sideways, so a rotor that is wider than
// the waist at both ends cannot leave the plate.
const rotor = (g, i) => {
  const [x, y] = cell(i), s = `${g} mm * sqrt(2)`
  return j.sketch(`r${i + 1}`, { on: j.plane.offset(j.plane.XZ, -y) })
    .polyline('half', [
      [x, 0], [`${x} mm + d / 2 + c - ${s}`, 0],
      [`${x} mm + d / 2 - ${g} mm`, `c - ${s} + ${g} mm`],
      [`${x} mm + d / 2 - ${g} mm`, `T - c + ${s} - ${g} mm`],
      [`${x} mm + d / 2 + c - ${s}`, 'T'],
      [`${x} mm + knob / 2`, 'T'], [`${x} mm + knob / 2`, 'T + rise'],
      [x, 'T + rise'],
    ], { closed: true })
}
const axisAt = i => {
  const [x, y] = cell(i)
  return j.axis.through(j.pt(x, y, 0), j.pt(x, y, 1))
}

let coupon = j.part('pip-coupon')
  .params({
    d: mm(8),          // waist of the hole
    c: mm(1.5),        // cone height at each face: 45°, so also its width
    T: mm(6),          // plate thickness
    knob: mm(6),       // grip on top of each rotor
    rise: mm(3),
    strip: mm(10),     // label strip at the left
  })
  .expose(['d', 'c', 'T'], {
    labels: { d: 'waist diameter', c: 'cone height', T: 'plate thickness' },
    ranges: { d: [mm(5), mm(10)], c: [mm(1), mm(2)], T: [mm(4), mm(10)] },
  })
  .extrude(j.sketch('outline', { on: j.plane.XY })
    .rect('plate', `${cols * pitch} mm + strip`, `${steps / cols * pitch} mm`,
      { at: ['-strip', 0] }).profiles(), 'T', { id: 'plate' })
// The hole centres as sketch points, once on the top face and once on the
// bed looking up (a hole drills against its sketch's normal). Flipping a
// plane keeps x and turns y round, hence −y underneath.
const centres = (id, on, sy) => gaps.reduce((sk, g, i) => {
  const [x, y] = cell(i)
  return sk.point(`h${i + 1}`, [x, sy * y])
}, j.sketch(id, { on }))
const sink = j.hole.countersink(j.expr('d'), 'd + 2 * c', deg(90), 'T / 2')
coupon = coupon
  .hole(centres('above', j.plane.offset(j.plane.XY, 'T'), 1), sink,
    { id: 'top' })
  .hole(centres('below', j.plane.XY.flip(), -1), sink, { id: 'bottom' })
gaps.forEach((g, i) => {
  coupon = coupon.revolve(rotor(g, i).profiles(), axisAt(i), turn(1),
    { id: `rotor${i + 1}` })
})
// a screwdriver slot across every knob, one cut
const slots = gaps.reduce((sk, g, i) => sk.rect(`s${i + 1}`,
  'knob', mm(1.2), { center: true, at: cell(i) }),
j.sketch('slots', { on: j.plane.offset(j.plane.XY, 'T + rise') }))
// each row's first gap in hundredths on the strip: 15 = 0.15 mm, 40 = 0.40
const rowLabel = (sk, row) => sk.text(`row${row + 1}`,
  String(Math.round(gaps[row * cols] * 100)),
  { size: mm(3.5), align: 'center', valign: 'middle',
    at: ['-strip / 2', `${(row + 0.5) * pitch} mm`] })
const labels = [0, 1].reduce(rowLabel,
  j.sketch('labels', { on: j.plane.offset(j.plane.XY, 'T') }))
coupon = coupon
  .cut(slots.profiles(), mm(1.5), { id: 'slots' })
  .cut(labels.profiles(), { two: [mm(0), mm(0.6)] }, { id: 'labels' })
  // what j.fit.calibrate reads from a print-in-place row
  .set('coupon', { kind: 'print-in-place', range: [mm(lo), mm(hi)], steps })

// Flat, as modelled: every gap is printed the way a real joint would be.
return j.print('pip-coupon', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [coupon],
}).orient('+Z')
