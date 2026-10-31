return j.sketch('flat', { on: j.plane.XY })
  .polyline('t', [[0, 0], [30, 0], [70, 0]], { closed: true })
  .constrain(j.c.fix('t.1.start'), j.c.horizontal('t.3'))
  .dim('t.1', 30).dim('t.2', 40).dim('t.3', 60)
