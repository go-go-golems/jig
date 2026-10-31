// D-07 · Headphone hanger: a C-clamp for a desk edge with a J-hook beneath,
// one side profile extruded to width, tightened by an M6 bolt and nut.
// Notice the print orientation: on its side, so the layers run round the
// hook and the bolt hole becomes a teardrop by itself.
// Side view on XZ: the desk top is at z = 0 and fills x ≥ 0 down to
// z = −desk.
const side = j.sketch('side', { on: j.plane.XZ })
  .polyline('p', [
    ['jaw', 't'], ['-t', 't'],                      // over the top jaw
    ['-t', 'saddle'],                               // down the spine
    ['-t - reach', 'saddle'],                       // the floor of the hook
    ['-t - reach', 'saddle + lip'],                 // up the inside of the lip
    ['-2 * t - reach', 'saddle + lip'],
    ['-2 * t - reach', 'saddle - t'],               // under the hook
    [0, 'saddle - t'],
    [0, '-throat - bj'], ['jaw', '-throat - bj'],   // under the bottom jaw
    ['jaw', '-throat'], [0, '-throat'],             // the throat
    [0, 0], ['jaw', 0],
  ], { closed: true })

// edges along Y below the top of the lip, left of the spine: the hook's
const hook = j.feat('body').edges('|Y').where((e, ctx) =>
  e.center.x < -ctx.p.t.value + 1e-6 &&
  e.center.z < ctx.p.saddle.value + ctx.p.lip.value + 1e-6)

const hanger = j.part('headphone-hanger')
  .params({
    desk: mm(25),          // desk thickness: 18–25 mm boards,
                           // 30–38 mm worktops
    travel: mm(8),         // the bolt takes up this much play
    throat: 'desk + travel',
    jaw: mm(40),           // how far the jaws reach under and over the desk
    t: mm(7),              // spine, top jaw and hook thickness
    bj: mm(12),            // bottom jaw: deep enough for an M6 nut (5.2 mm)
    reach: mm(42),         // inside width of the hook: a headband is 30–40 mm
    lip: mm(16),           // height of the lip that keeps the band on
    drop: mm(10),          // the hook hangs this far below the bottom jaw
    saddle: '-throat - bj - drop',
    b: mm(30),             // width along the desk edge
    round: mm(6),          // inside corners of the hook: kind to a headband
    tip: mm(3),            // outside corners: less than half of t
  })
  .expose(['desk', 'reach', 'b', 't'], {
    labels: {
      desk: 'desk thickness', reach: 'inside width of the hook',
      b: 'width along the edge', t: 'thickness',
    },
    ranges: {
      desk: [mm(12), mm(40)], reach: [mm(25), mm(60)],
      b: [mm(20), mm(50)], t: [mm(5), mm(10)],
    },
  })
  .extrude(side.profiles(), 'b', { id: 'body' })
  // The headband rests in the hook: round its two inside corners (concave)
  // and the outside corners of the lip and the hook (convex). All of them
  // are edges along Y, below the top of the lip.
  .fillet(hook.where(e => e.concave), 'round', { id: 'saddle' })
  .fillet(hook.where(e => e.convex), 'tip', { id: 'tips' })
  // an M6 bolt pushes up into the desk; its nut sits in a hex pocket that
  // opens under the bottom jaw
  .hole([j.pt('jaw / 2', '-b / 2', '-throat - bj')],
    j.hole.nutTrap('M6', { from: 'top', depth: 'bj' }), { id: 'bolt' })

// On its side: the profile lies on the bed, so the hook bends within the
// layers rather than across them, and the bolt hole prints as a teardrop.
return j.print('headphone-hanger', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [hanger],
}).orient('+Y').use(j.rules.fdm)
