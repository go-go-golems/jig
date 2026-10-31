// S-01 · Cable clip for a desk edge: one sketch, one extrude.
// Notice how every corner of the outline is an expression of five params,
// so one change to `desk` moves the jaws.
// The side view is drawn on XZ: x runs into the desk, z up;
// the spine sits at x = −t, the desk fills x ≥ 0, 0 ≤ z ≤ desk.
const side = j.sketch('side', { on: j.plane.XZ })
  .polyline('outline', [
    ['jaw', 'desk + t'],                 // top jaw, outer tip
    ['-t', 'desk + t'],                  // over the spine
    ['-t', '-2 * t - cable'],            // down the back
                                         // to the bottom of the hook
    ['cable + t', '-2 * t - cable'],     // under the cable channel
    ['cable + t', '-t - cable / 2'],     // up the lip
    ['cable', '-t - cable / 2'],
    ['cable', '-t - cable'],             // inside the channel
    [0, '-t - cable'],
    [0, '-t'],                           // under the bottom jaw
    ['jaw', '-t'],
    ['jaw', '-1 mm'],                    // bottom jaw tip:
                                         // a lead-in up to the grip bump
    ['jaw - 2 mm', 'grip'],
    ['jaw - 4 mm', 0],
    [0, 0],                              // the desk's underside
    [0, 'desk'],                         // the desk's edge
    ['jaw - 4 mm', 'desk'],
    ['jaw - 2 mm', 'desk - grip'],       // top jaw grip bump
    ['jaw', 'desk + 1 mm'],
  ], { closed: true })

const clip = j.part('cable-clip')
  .params({
    desk: mm(18),     // board thickness: 18 mm is the common chipboard
                      // and MDF desktop; 25 mm for thicker tops
    cable: mm(8),     // width of the cable channel:
                      // one USB-C cable is about 4 mm,
                      // a laptop power cable 6–7 mm
    w: mm(12),        // width of the clip along the desk edge
    t: mm(3),         // thickness of the spine and jaws
    jaw: mm(15),      // how far the jaws reach onto the desk
    grip: mm(0.6),    // the bumps at the jaw tips pinch the board
                      // by this much on each side
  })
  .expose(['desk', 'cable', 'w', 't'], {
    labels: {
      desk: 'desk thickness', cable: 'cable channel width',
      w: 'clip width', t: 'wall thickness',
    },
    ranges: {
      desk: [mm(10), mm(40)], cable: [mm(3), mm(20)],
      w: [mm(6), mm(30)], t: [mm(2), mm(5)],
    },
  })
  .extrude(side.profiles(), 'w', { id: 'body' })

// Printed on its side: the outline lies on the bed,
// so the layers run along the jaws and the spine bends with them.
return j.print('cable-clip', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [clip],
})
