// X-03 · DIN-rail clip: hooks a board, a relay module or a small box onto
// a 35 mm top-hat rail. A fixed hook takes the rail's top edge; a springy
// arm with a catch snaps over the bottom edge. Notice the arm: its strain,
// 1.5 · t · δ / L², is a param, so a change to the arm shows at once
// whether PETG will take it.
// Rail: EN 60715 TS35 × 7.5, flanges 1 mm thick, edges at z = ±17.5 mm.
// Section on YZ (x is world Y, y world Z): the flanges' front face is y = 0,
// the clip sits in front of it (y > 0) and reaches behind (y < 0).
const section = j.sketch('section', { on: j.plane.YZ })
  .polyline('p', [
    ['tp', 'top'], ['-back', 'top'],              // over the top edge
    ['-back', 'edge - k'], ['-(f + g)', 'edge - k'],   // the fixed hook
    ['-(f + g)', 'edge + g'], [0, 'edge + g'],
    [0, '-edge - g + s'],                         // down the rail's face
    ['tp - root', '-edge - g + s'],               // the slit, to the root
    ['tp - root', '-edge - g'],
    ['-(f + g)', '-edge - g'],                    // the arm's top, back to
    ['-(f + g)', '-edge + k'],                    // the catch, with a 45°
    ['-back', '-edge + k - hh'],                  // lead-in on its back
    ['-back', '-edge - g - ta'],
    ['tp', '-edge - g - ta'],                     // under the arm
  ], { closed: true })

const clip = j.part('din-clip')
  .params({
    edge: mm(17.5),        // half the rail's height
    f: mm(1),              // flange thickness
    g: mm(0.3),            // clearance round the flanges
    k: mm(1.5),            // how far each hook reaches behind a flange
    hh: mm(1.5),           // hook thickness
    back: 'f + g + hh',    // how far the hooks reach behind the face
    tp: mm(14),            // depth of the body in front of the rail
    ta: mm(1.6),           // arm thickness
    s: mm(1.2),            // the slit over the arm
    root: mm(2),           // where the arm joins the body
    top: 'edge + g + hh',
    w: mm(30),             // width along the rail
    // the arm bends by k + g to let the catch past the flange
    L_arm: 'tp - root + back',
    strain: '1.5 * ta * (k + g) / pow(L_arm, 2)',   // PETG takes about 0.04
  })
  .expose(['w', 'tp', 'ta', 'k'], {
    labels: { w: 'width along the rail', tp: 'depth of the body',
      ta: 'arm thickness', k: 'hook reach' },
    ranges: { w: [mm(10), mm(80)], tp: [mm(10), mm(25)],
      ta: [mm(1.2), mm(2.4)], k: [mm(1), mm(2.5)] },
  })
  .extrude(section.profiles(), { symmetric: 'w' }, { id: 'body' })
  // two M3 heat-set inserts in the front face for whatever hangs on it
  .hole([j.pt('-w / 2 + 7 mm', 'tp', mm(6)), j.pt('w / 2 - 7 mm', 'tp', mm(6))],
    j.hole.insert('M3x5.7'), { id: 'inserts' })

// On its side (+X up): the section lies on the bed, so the arm bends within
// the layers and does not split along them; the insert holes become
// teardrops.
return j.print('din-clip', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [clip],
}).orient('+X').use(j.rules.fdm)
