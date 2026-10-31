// Fit-aware holes: a pin hole sized from the slide class, and a calibrated profile.
const prof = j.fit.profile('mk4-petg', { classes: { press: mm(0.035), snug: mm(0.085), slide: mm(0.135), free: mm(0.235), printInPlace: mm(0.35) }, holeComp: mm(0.05) })
const board = j.part('peg-board')
  .params({ pin: mm(3) })
  .extrude(j.sketch('s', { on: j.plane.XY }).rect('r', 30, 20, { center: true }).profiles(), mm(6), { id: 'body' })
  .hole([[-8, 0], [8, 0]], j.hole.simple(j.fit.hole('pin', 'slide'), mm(6)), { id: 'pins' })
  .hole([[0, 5]], j.hole.clearance('M3', { fit: 'slide' }), { id: 'screw' })
return data.cfg?.calibrated ? board.fit(prof) : board
