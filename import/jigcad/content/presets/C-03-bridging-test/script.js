// C-03 · Bridging test: one bar on seven pillars, spans from 5 to 40 mm.
// Notice that the openings are one sketch of six rectangles, cut up from the
// base in one feature, so every span reads from the front.
const spans = [5, 10, 15, 20, 30, 40]   // mm, clear span, left to right

// Span k starts after k + 1 pillars and the spans before it.
const before = k => spans.slice(0, k).reduce((a, b) => a + b, 0)
const openings = spans.reduce((sk, s, k) => sk.rect(`s${s}`, `${s} mm`, 'w',
  { at: [`${k + 1} * p + ${before(k)} mm`, 'front'] }),
j.sketch('openings', { on: j.plane.offset(j.plane.XY, 'base') }))

const test = j.part('bridging-test')
  .params({
    p: mm(4),          // pillar width
    w: mm(6),          // bar width (along Y)
    H: mm(5),          // clear height under every span
    deck: mm(1.2),     // bar thickness over the spans: six layers
    base: mm(1.2),     // base plate under the whole test
    front: mm(7),      // label strip in front of the bar
    L: `${spans.length + 1} * p + ${before(spans.length)} mm`,
  })
  .expose(['w', 'H', 'deck'], {
    labels: { w: 'bar width', H: 'clear height', deck: 'deck thickness' },
    ranges: { w: [mm(3), mm(15)], H: [mm(2), mm(15)], deck: [mm(0.4), mm(3)] },
  })
  .extrude(j.sketch('foot', { on: j.plane.XY })
    .rect('plate', 'L', 'front + w', { at: [0, 0] }).profiles(),
  'base', { id: 'base' })
  .extrude(j.sketch('bar', { on: j.plane.offset(j.plane.XY, 'base') })
    .rect('bar', 'L', 'w', { at: [0, 'front'] }).profiles(),
  'H + deck', { id: 'bar' })
  // up from the base top: H along the normal, nothing below
  .cut(openings.profiles(), { two: ['H', 0] }, { id: 'spans' })

// the shortest and the longest span, engraved 0.6 mm into the strip in front
// of them (the bar stands above the plane, so the extent says which way)
const n = spans.length
const tag = { size: mm(4), align: 'center', valign: 'middle' }
const labels = j.sketch('labels', { on: j.plane.offset(j.plane.XY, 'base') })
  .text('first', String(spans[0]), { ...tag,
    at: [`p + ${spans[0] / 2} mm`, 'front / 2'] })
  .text('last', String(spans[n - 1]), { ...tag,
    at: [`L - p - ${spans[n - 1] / 2} mm`, 'front / 2'] })

// Upright, as modelled: the bar must bridge, so no supports under it.
return j.print('bridging-test', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [test.cut(labels.profiles(), { two: [mm(0), mm(0.6)] },
    { id: 'labels' })],
}).orient('+Z')
