// W-01 · Pegboard hook: a single hook for 1/4" pegboard, from one side
// profile. Notice the pegs: a square section with chamfered corners has to
// fit the round hole across its diagonal, so `peg` and `ease` are sized
// together. Pegboard: 1/4 in (6.35 mm) holes on 1 in (25.4 mm) centres, in
// 1/4 in (6.35 mm) or 1/8 in (3.2 mm) hardboard.
// Side view on XZ: the face of the board is x = 0, the board is behind it
// (x < 0), the upper hole is at z = 0 and the lower one at z = −pitch.
const side = j.sketch('side', { on: j.plane.XZ })
  .polyline('p', [
    ['t', 'peg / 2 + 4 mm'], [0, 'peg / 2 + 4 mm'],     // top of the plate
    [0, 'peg / 2'], ['-back', 'peg / 2'],               // upper peg
    ['-back', 'peg / 2 + rise'],                        // turns up behind
    ['-back - peg', 'peg / 2 + rise'],
    ['-back - peg', '-peg / 2'], [0, '-peg / 2'],
    [0, '-pitch + peg / 2'],                            // lower peg: a stub
    ['-board + 0.5 mm', '-pitch + peg / 2'],
    ['-board + 0.5 mm', '-pitch - peg / 2'], [0, '-pitch - peg / 2'],
    [0, 'zb'], ['t + reach', 'zb'],                     // under the arm
    ['t + reach', 'zb + arm + tip'],                    // the upturned tip
    ['t + reach - peg', 'zb + arm + tip'],
    ['t + reach - peg', 'zb + arm'], ['t', 'zb + arm'], // top of the arm
  ], { closed: true })

const hook = j.part('pegboard-hook')
  .params({
    pitch: mm(25.4),       // 1 in between hole centres
    hole: mm(6.35),        // 1/4 in holes
    board: mm(6.35),       // board thickness; 3.2 mm for 1/8 in board
    peg: mm(5.2),          // the peg's square section, and the part's width
    ease: mm(1.2),         // chamfer on every long edge
    // the peg's diagonal after the chamfer, which must be under the hole
    diag: '2 * hypot(peg / 2, peg / 2 - ease)',
    back: 'board + 0.5 mm',    // the upper peg reaches past the board
    rise: mm(6),           // and turns up behind it by this much
    t: mm(5),              // the plate against the board
    reach: mm(50),         // length of the arm
    arm: mm(8),            // depth of the arm
    tip: mm(10),           // the tip stands up this far
    zb: '-pitch + peg / 2 - arm',   // underside of the arm
  })
  .expose(['reach', 'tip', 'board', 'arm'], {
    labels: {
      reach: 'length of the arm', tip: 'height of the tip',
      board: 'pegboard thickness', arm: 'depth of the arm',
    },
    ranges: {
      reach: [mm(20), mm(120)], tip: [mm(0), mm(30)],
      board: [mm(3), mm(7)], arm: [mm(6), mm(14)],
    },
  })
  .extrude(side.profiles(), 'peg', { id: 'body' })
  // every long edge: the loops of both side faces of the extrude
  .chamfer(j.feat('body').startFace().edges()
    .or(j.feat('body').endFace().edges()), 'ease', { id: 'ease' })

// On its side: the profile lies on the bed, so the arm and the turned-up
// peg bend within the layers. The chamfers face the bed at 45°.
return j.print('pegboard-hook', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [hook],
}).orient('+Y').use(j.rules.fdm)
