// W-02 · Vise soft jaws: a pair of pads that hang over the steel jaws of a
// bench vise and hold on with magnets, with V-grooves for round stock.
// Notice the print orientation: face down, so the lip stands up as a wall
// and the grooves' 45° sides need no support; qty: 2 puts both on a plate.
// Section on YZ: the steel jaw's face is y = 0 (the jaw is at y > 0) and
// its top is z = 0; the pad covers the face and hooks over the top.
const section = j.sketch('section', { on: j.plane.YZ })
  .polyline('p', [
    ['-t', '-H'], [0, '-H'],             // the pad's face plate, t thick
    [0, 0], ['lip', 0],                  // over the top of the jaw
    ['lip', 'lip_t'], ['-t', 'lip_t'],
  ], { closed: true })

// Two 90° V-grooves `vee` deep in the face (y = −t), each drawn 0.5 mm
// proud of the face so the cut leaves no skin.
// Across the face, half way down: a V on YZ (x is world Y, y is world Z).
const across = j.sketch('across', { on: j.plane.YZ })
  .polyline('v', [
    ['-t - 0.5 mm', '-H / 2 - vee - 0.5 mm'],
    ['-t - 0.5 mm', '-H / 2 + vee + 0.5 mm'],
    ['-t + vee', '-H / 2'],
  ], { closed: true })
// Up the face, in the middle: a V on XY, cut along Z through the lip too.
const upright = j.sketch('upright', { on: j.plane.XY })
  .polyline('v', [
    ['-vee - 0.5 mm', '-t - 0.5 mm'], ['vee + 0.5 mm', '-t - 0.5 mm'],
    [0, '-t + vee'],
  ], { closed: true })

const pad = j.part('soft-jaw')
  .params({
    W: mm(100),            // jaw width: 100 mm (4 in) vises are common
    H: mm(25),             // how far the pad covers the face of the jaw
    t: mm(7),              // face plate: a 3.2 mm pocket behind, a 3 mm V in
                           // front and 0.8 mm between them
    lip: mm(8),            // how far the lip reaches over the top
    lip_t: mm(4),
    vee: mm(3),            // depth of the V-grooves (6 mm wide at the face)
    mag_d: mm(10),         // 10 × 3 mm disc magnets
    mag_h: mm(3),
    mag_x: 'W / 2 - 15 mm',   // two magnets, this far either side of centre
  })
  .expose(['W', 'H', 'vee', 'mag_d'], {
    labels: {
      W: 'jaw width', H: 'pad height', vee: 'groove depth',
      mag_d: 'magnet diameter',
    },
    ranges: {
      W: [mm(50), mm(200)], H: [mm(12), mm(50)], vee: [mm(1), mm(5)],
      mag_d: [mm(5), mm(15)],
    },
  })
  .extrude(section.profiles(), { symmetric: 'W' }, { id: 'body' })
  .cut(across.profiles(), { symmetric: 'W + 2 mm' }, { id: 'across' })
  .cut(upright.profiles(), { symmetric: '2 * (H + lip_t) + 2 mm' },
    { id: 'upright' })
  // magnet pockets in the back of the face plate, drilled from y = 0 into
  // the plate: a snug fit, 0.2 mm deeper than the magnet for glue
  .hole([j.pt('-mag_x', 0, '-H / 2'), j.pt('mag_x', 0, '-H / 2')],
    j.hole.simple(j.fit.hole('mag_d', 'snug'), 'mag_h + 0.2 mm'),
    { id: 'magnets' })
  .chamfer(j.feat('body').sideFace('p.1').edges()
    .or(j.feat('body').sideFace('p.6').edges()), mm(0.6), { id: 'ease' })

// Face down (+Y up puts the face, y = −t, on the bed): the lip becomes a
// wall, the grooves open onto the bed with 45° sides, the magnet pockets
// face up.
return j.print('soft-jaws', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
}).add('soft-jaw', pad, { qty: 2, orient: '+Y' }).use(j.rules.fdm)
