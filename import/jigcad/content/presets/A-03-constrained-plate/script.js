// A-03 · A constrained sketch: a mounting plate solved from constraints.
// The outline is four lines joined at shared points, kept square by
// horizontal and vertical constraints, and sized by dimensions tied to
// params. Hole h1 is fully placed. Hole h2 matches h1's size and height,
// but its x position is left free on purpose: open the sketch from the
// stage's Sketch menu and drag it along the plate.
const plate = j.sketch('outline', { on: j.plane.XY })
  .line('l1', [0, 0], [80, 0])
  .line('l2', 'l1.end', [80, 40])
  .line('l3', 'l2.end', [0, 40])
  .line('l4', 'l3.end', 'l1.start')
  .circle('h1', 2, { at: [12, 20] })
  .circle('h2', 2, { at: [60, 20] })
  .constrain(
    j.c.fix('l1.start'),
    j.c.horizontal('l1'), j.c.horizontal('l3'),
    j.c.vertical('l2'), j.c.vertical('l4'),
    j.c.equal('h2', 'h1'),
  )
  .dim('l1', 'w')
  .dim('l2', 'd')
  .dim('h1', 'hole_d')
  .dim({ h: ['l1.start', 'h1.center'] }, 'edge')
  .dim({ v: ['l1.start', 'h1.center'] }, 'd / 2')
  .dim({ v: ['h1.center', 'h2.center'] }, 0)

return j.part('plate')
  .params({ w: mm(80), d: mm(40), t: mm(4), hole_d: mm(4.5),
    edge: mm(12) })
  .expose(['w', 'd', 'hole_d'], {
    labels: { w: 'width', d: 'depth', hole_d: 'hole diameter' },
    ranges: { w: [mm(40), mm(160)], d: [mm(20), mm(80)],
      hole_d: [mm(2), mm(8)] },
  })
  .extrude(plate.profiles(), 't', { id: 'body' })
