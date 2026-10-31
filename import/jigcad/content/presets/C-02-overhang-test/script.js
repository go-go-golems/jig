// C-02 · Overhang test: six ledges whose undersides lean 20° to 70° from
// vertical. Notice that each ledge is one polyline whose reach is h · tan(θ),
// and that the job reports the ledges past 45° as overhang on purpose.
const angles = [20, 30, 40, 50, 60, 70]   // degrees from vertical

// One fin per angle, drawn in its own XZ plane (normal −Y, so the plane
// sits at the fin's far side and the extrude runs back towards it):
// a post t thick, then a ledge whose underside rises h while it reaches
// h · tan(θ), capped by a flat top `cap` thick.
const fin = (a, i) => j.sketch(`f${a}`, {
  on: j.plane.offset(j.plane.XZ, `-(${i} * pitch + w)`),
}).polyline('edge', [
  [0, 0], ['t', 0], ['t', 'base'],
  [`t + h * tan(${a}°)`, 'base + h'],
  [`t + h * tan(${a}°)`, 'base + h + cap'],
  [0, 'base + h + cap'],
], { closed: true })

let test = j.part('overhang-test')
  .params({
    h: mm(8),          // rise of every ledge
    t: mm(4),          // the post the ledges grow from
    w: mm(8),          // width of a fin (along Y)
    pitch: 'w + 3 mm', // fin to fin
    cap: mm(1.2),      // top of each ledge: six layers
    base: mm(2),       // the ledges start this far above the bed
    shelf: mm(12),     // label shelf behind the posts
  })
  .expose(['h', 'w', 'cap'], {
    labels: { h: 'rise of each ledge', w: 'fin width', cap: 'ledge thickness' },
    ranges: { h: [mm(4), mm(15)], w: [mm(5), mm(15)], cap: [mm(0.6), mm(3)] },
  })
  // the shelf: a plate behind the posts that ties the fins together
  .extrude(j.sketch('foot', { on: j.plane.XY })
    .rect('plate', 'shelf', `${angles.length} * pitch - 3 mm`,
      { at: ['-shelf', 0] }).profiles(), 'base', { id: 'shelf' })
angles.forEach((a, i) => {
  test = test.extrude(fin(a, i).profiles(), 'w', { id: `fin${a}` })
})

// the first and the last angle, engraved on the shelf (the rest step by 10°)
const n = angles.length
const tag = { size: mm(4), align: 'center', valign: 'middle' }
const labels = j.sketch('labels', { on: j.plane.offset(j.plane.XY, 'base') })
  .text('first', String(angles[0]), { ...tag,
    at: ['-shelf / 2', 'w / 2'] })
  .text('last', String(angles[n - 1]), { ...tag,
    at: ['-shelf / 2', `${n - 1} * pitch + w / 2`] })
// 0.6 mm down into the shelf; the fins stand above the plane, so the extent
// says which way
test = test.cut(labels.profiles(), { two: [mm(0), mm(0.6)] }, { id: 'labels' })

// Printed as modelled, posts up: the ledges are the test, so no supports.
return j.print('overhang-test', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [test],
}).orient('+Z')
