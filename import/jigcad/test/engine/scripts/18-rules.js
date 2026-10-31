// Print rules: a thin-walled cup with a tiny hole, checked with j.rules.fdm.
return j.part('cup')
  .extrude(j.sketch('s', { on: j.plane.XY }).circle('c', 15).profiles(), mm(40), { id: 'body' })
  .shell(j.feat('body').endFace(), mm(0.6), { id: 'walls' })
  .hole([[0, 0]], j.hole.simple(mm(0.6), mm(1)), { id: 'vent' })
  .use(j.rules.fdm)
