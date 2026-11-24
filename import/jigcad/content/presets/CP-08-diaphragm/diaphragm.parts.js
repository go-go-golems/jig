// Approximate dimensions in mm within the archival diaphragm envelope.

const plane = z => j.plane.offset(j.plane.XY, mm(z))
const polar = (r, a) => [r * Math.cos(a * Math.PI / 180),
                         r * Math.sin(a * Math.PI / 180)]
const annulus = (outer, inner) =>
  j.region.circle(outer).subtract(j.region.circle(inner))
const plate = name => j.part(name).material(j.material('steel'))
  .color('#33373b').finish({ finish: 'black-oxide' })
const pivot = i => polar(21, i * 72 - 23)
const guide = i => polar(24, i * 72 + 18)
const atPin = (r, xy) => j.region.circle(r, { at: xy })

function leaf(i) {
  const z = 9.29 + i * 0.08
  const outline = []
  // Each open leaf shades slightly more than one fifth of the annulus.
  // The swept-back ends overlap their neighbours on separate Z levels.
  for (let step = 0; step <= 24; step++) {
    outline.push(polar(26, i * 72 - 39 + step * 80 / 24))
  }
  for (let step = 24; step >= 0; step--) {
    outline.push(polar(12, i * 72 - 20 + step * 82 / 24))
  }
  return plate('Diaphragm blade 105 (' + (i + 1) + ')')
    .extrude(j.region.polygon(outline).on(plane(z)), mm(0.06),
             { id: 'leaf' })
    .extrude(atPin(0.32, pivot(i)).on(plane(z + 0.06)),
             mm(9.8 - z - 0.06), { id: 'bearingPin' })
    .extrude(atPin(0.32, guide(i)).on(plane(9.20)),
             mm(z - 9.20), { id: 'guidePin' })
}

function bearingCover() {
  let ring = annulus(27.45, 20)
  for (let i = 0; i < 5; i++) {
    ring = ring.subtract(atPin(0.37, pivot(i)))
  }
  return plate('Blade cover 116').extrude(ring.on(plane(9.73)), mm(0.07),
                                          { id: 'bearingCover' })
}

function guideCover() {
  let ring = annulus(27.45, 20)
  for (let i = 0; i < 5; i++) {
    const [x, y] = guide(i)
    const [dx, dy] = polar(2.1, i * 72 + 74)
    ring = ring.subtract(j.region.slot([x - dx, y - dy],
                                       [x + dx, y + dy], 0.78))
  }
  return plate('Diaphragm cover 106').extrude(ring.on(plane(9.20)),
                                              mm(0.07), { id: 'guideCover' })
}
return { leaf, bearingCover, guideCover }
