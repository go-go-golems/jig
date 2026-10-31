// E-01 · A wall hook: a plate against the wall, an arm, an upturned tip, as
// three joined extrudes.
const back = j.sketch('back', { on: j.plane.XZ })
  .rect('r', 't', 'plate', { at: [0, 0] })
const arm = j.sketch('arm', { on: j.plane.XZ })
  .rect('r', 'arm', 't', { at: [0, 0] })
const tip = j.sketch('tip', { on: j.plane.XZ })
  .rect('r', 't', 12, { at: ['arm - t', 0] })

return j.part('hook')
  .params({ b: mm(20), t: mm(6), arm: mm(40), plate: mm(50) })
  .expose(['b', 't', 'arm'], {
    labels: {
      b: 'width of the hook', t: 'thickness of the arm',
      arm: 'reach of the arm',
    },
  })
  .extrude(back.profiles(), 'b', { id: 'back' })
  .extrude(arm.profiles(), 'b', { id: 'arm' })
  .extrude(tip.profiles(), 'b', { id: 'tip' })
