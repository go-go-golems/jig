// C-01 · Fit coupon: ten holes in 0.05 mm steps, ten loose pins,
// a proof block.
// Notice that the coupon is j.fit.coupon, and that measured.json becomes the
// fit profile of this printer through j.fit.calibrate.

// The coupon: Ø6 mm pins, radial gaps 0.05 to 0.50 mm in ten steps. It is
// modelled raw (no fit classes, no hole compensation): it measures the printer.
const pin = mm(6), lo = mm(0.05), hi = mm(0.5), steps = 10
const coupon = j.fit.coupon({ kind: 'pin-hole', pin, range: [lo, hi], steps })
const { gaps } = coupon.meta.sets.coupon

// j.fit.coupon spaces the holes at pin + 2 × largest gap + 4 mm on a plate
// pin + 8 mm deep and 4 mm thick; the labels go on a strip behind it.
const pitch = pin.value + 2 * hi.value + 4, depth = pin.value + 8
const strip = j.region.rect(pitch * steps, 6, { center: false, at: [0, depth] })
// The smallest and the largest gap are labelled in hundredths of a
// millimetre (5 = 0.05 mm); the holes between step evenly. Text is costly to
// cut (every glyph curve is a face), so two labels, not ten.
const label = i => j.region.text(String(Math.round(gaps[i] * 100)), {
  size: mm(3), at: [pitch * (i + 0.5), depth + 3],
})
const labels = label(0).union(label(steps - 1))
const top = j.plane.offset(j.plane.XY, mm(4))
const labelled = coupon
  .extrude(strip, mm(4), { id: 'strip' })
  // the pins stand above the plate, so say which way the cut goes: 0.6 mm
  // down from the top face, nothing up
  .cut(labels.on(top), { two: [mm(0), mm(0.6)] }, { id: 'labels' })

// What you measured (see the notes): one row per coupon. Holes pair the
// nominal size the coupon modelled with the size you measured.
const meas = data.measured
const cal = j.fit.calibrate([{
  pin: mm(meas.pin),
  holes: gaps.map((g, i) => [mm(pin.value + 2 * g), mm(meas.holes[i])]),
  outcomes: meas.outcomes,
  coupon: coupon.meta.sets.coupon,
}])
// Holes print as a·nominal + b, so a hole modelled (T − b) / a comes out at
// T. The compensation is taken at the pin size: over 6 to 7 mm it changes by
// less than 0.01 mm. Pins print pinOversize too large; xyComp takes half of it
// off each side.
const T = pin.value
const profile = j.fit.profile('my-printer', {
  classes: cal.classes,
  holeComp: mm((T - cal.hole.b) / cal.hole.a - T),
  xyComp: mm(-cal.pinOversize / 2),
})

// The proof block: three holes for the pin you measured, sized from your
// profile. The pin should press into the left hole, slide through the middle
// one and drop through the right one. It sits behind the coupon on the stage;
// the job packs the plate anyway.
const at = [pitch * steps / 2, depth + 20]
const proof = j.part('proof')
  .params({ pin: mm(meas.pin), w: mm(42), d: mm(14), h: mm(6) })
  .expose(['pin'], {
    labels: { pin: 'pin diameter as measured' },
    ranges: { pin: [mm(5.8), mm(6.2)] },
  })
  .extrude(j.region.rect('w', 'd', { at }), 'h', { id: 'block' })
  .hole([[at[0] - 13, at[1]]], j.hole.simple(j.fit.hole('pin', 'press')),
    { id: 'press' })
  .hole([at], j.hole.simple(j.fit.hole('pin', 'slide')), { id: 'slide' })
  .hole([[at[0] + 13, at[1]]], j.hole.simple(j.fit.hole('pin', 'free')),
    { id: 'free' })

return j.print('fit-coupon', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  fit: profile, parts: [labelled, proof],
}).orient('+Z')
