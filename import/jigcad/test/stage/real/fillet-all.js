// Fillets everywhere: a 40 × 30 × 20 mm block with every edge rounded 5 mm (tangent edges, fillet tessellation).
return j.part('soap')
  .extrude(j.sketch('b', { on: j.plane.XY }).rect('r', 40, 30, { center: true }).profiles(), mm(20), { id: 'body' })
  .fillet(j.feat('body').edges(), mm(5), { id: 'round' })
