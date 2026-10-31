// Exports: a small bracket compiled once, exported as STL, STEP, 3MF, IR (checked by the harness).
return j.part('bracket')
  .add(j.box(60, 30, 5), { id: 'base' })
  .add(j.box(60, 5, 40), { at: j.tx.move(0, 0, 5), id: 'upright' })
  .hole([j.pt(15, 18, 5), j.pt(45, 18, 5)], j.hole.clearance('M4', { fit: 'free' }), { id: 'screws' })
