// A sketch with conflicting constraints: the minimal conflicting set is reported.
const sk = j.sketch('bad', { on: j.plane.XY })
  .line('l1', [0, 0], [40, 0]).line('l2', 'l1.end', [40, 30]).line('l3', 'l2.end', [0, 30]).line('l4', 'l3.end', 'l1.start')
  .constrain(j.c.horizontal('l1'), j.c.vertical('l2'), j.c.horizontal('l3'), j.c.vertical('l4'), j.c.fix('l1.start'))
  .dim('l1', 40).dim('l3', 50)
return j.part('p').extrude(sk.profiles(), mm(5), { id: 'body' })
