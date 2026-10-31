// C-06 · Wall thickness: six fins from one to four line widths thick.
// Notice that the thicknesses are symbolic (`1.5 lw`): they follow the
// printer's line width, so the same test fits a 0.4 or a 0.6 mm nozzle.
const widths = [1, 1.5, 2, 2.5, 3, 4]   // in line widths
const n = widths.length

// fin k: a wall widths[k] line widths thick, `len` long and `h` tall,
// standing on the base at x = k · gap; all six in one sketch
const fins = widths.reduce((sk, w, k) => sk.rect(`t${k + 1}`, `${w} lw`,
  'len', { at: [`${k} * gap`, 'front'] }),
j.sketch('fins', { on: j.plane.offset(j.plane.XY, 'base') }))

const test = j.part('wall-test')
  .params({
    len: mm(20),     // fin length (along Y)
    h: mm(12),       // fin height above the base
    gap: mm(7),      // fin to fin
    base: mm(1.6),
    front: mm(7),    // label strip in front of the fins
  })
  .expose(['len', 'h', 'gap'], {
    labels: { len: 'fin length', h: 'fin height', gap: 'fin spacing' },
    ranges: { len: [mm(10), mm(40)], h: [mm(5), mm(30)], gap: [mm(5), mm(15)] },
  })
  .extrude(j.sketch('foot', { on: j.plane.XY })
    .rect('plate', `${n - 1} * gap + 2 * 4 mm + 4 lw`, 'front + len + 4 mm',
      { at: ['-4 mm', 0] }).profiles(), 'base', { id: 'base' })
  .extrude(fins.profiles(), 'h', { id: 'fins' })

// the thinnest and the thickest, in line widths, on the strip in front
const tag = { size: mm(4), align: 'center', valign: 'middle' }
const labels = j.sketch('labels', { on: j.plane.offset(j.plane.XY, 'base') })
  .text('first', String(widths[0]), { ...tag, at: [0, 'front / 2'] })
  .text('last', String(widths[n - 1]),
    { ...tag, at: [`${n - 1} * gap`, 'front / 2'] })

// Upright: the fins are the test, built from the bed up.
return j.print('wall-test', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [test.cut(labels.profiles(), { two: [mm(0), mm(0.6)] },
    { id: 'labels' })],
}).orient('+Z')
