// Patterns replay a feature's tool: a boss repeated around Z, then mirrored.
return j.part('hub')
  .extrude(j.sketch('d', { on: j.plane.XY }).circle('c', 30).profiles(), mm(5), { id: 'disc' })
  .extrude(j.sketch('b', { on: j.feat('disc').endFace() }).circle('c', 4, { at: [20, 0] }).profiles(), mm(6), { id: 'boss' })
  .pattern(j.feat('boss'), j.pattern.circular(j.axis.Z, { count: 6 }), { id: 'bosses' })
  .cut(j.sketch('h', { on: j.plane.XY }).circle('c', 2, { at: [10, 10] }).profiles(), { through: 'all' }, { id: 'pin' })
  .mirror(j.feat('pin'), j.plane.YZ, { id: 'pins' })
