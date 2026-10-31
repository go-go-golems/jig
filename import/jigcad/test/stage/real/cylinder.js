// A tall cylinder with a bore: silhouettes of a revolved surface.
return j.part('spool')
  .extrude(j.sketch('c', { on: j.plane.XY }).circle('o', 20).profiles(), mm(80), { id: 'body' })
  .cut(j.sketch('h', { on: j.plane.XY }).circle('i', 6).profiles(), { through: 'all' }, { id: 'bore' })
