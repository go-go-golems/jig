return j.sketch('pts', { on: j.plane.XY })
  .point('a', [0, 0])
  .point('b', [10, 5])
  .constrain(j.c.fix('a'), j.c.distance('b', 'a', 0))
