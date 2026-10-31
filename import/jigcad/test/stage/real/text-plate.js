// Embossed text on a plate.
return j.part('tag')
  .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 80, 30, { center: true, r: 4 }).profiles(), mm(3), { id: 'body' })
  .emboss(j.region.text('JIG 42', { size: mm(14) }), mm(1), { on: j.feat('body').endFace(), id: 'label' })
