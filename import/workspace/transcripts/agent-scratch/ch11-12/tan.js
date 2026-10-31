return j.sketch('tangents', { on: j.plane.XY })
  .circle('c1', 10, { at: [0, 0] })
  .circle('c2', 6, { at: [18, 3] })
  .circle('c3', 10, { at: [50, 0] })
  .circle('c4', 6, { at: [52, 1] })
  .constrain(
    j.c.fix('c1.center'), j.c.fix('c3.center'),
    j.c.horizontal('c1.center', 'c2.center'),
    j.c.horizontal('c3.center', 'c4.center'),
    j.c.tangent('c1', 'c2'), j.c.tangent('c3', 'c4'))
  .dim('c1', 20).dim('c2', 12).dim('c3', 20).dim('c4', 12)
