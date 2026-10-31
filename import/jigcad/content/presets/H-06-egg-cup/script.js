// H-06 · Egg cup: one half-section with a spherical bowl, turned about Z;
// four to a plate.
// Notice `zc`: the bowl's centre is solved in an expression, so the bowl
// meets the rim at `rin` and is `depth` deep whatever egg it is sized for.
const section = j.sketch('section', { on: j.plane.XZ })  // x: radius, z: up
  .polyline('o', [
    [0, 'H - depth'], [0, 0],                    // up the axis to the bowl
    ['foot_d / 2', 0], ['foot_d / 2', 'foot_h'], // the foot
    ['stem_d / 2', 'stem_z'],                    // in to the stem
    ['rim_d / 2', 'H'], ['rin', 'H'],            // out to the rim
  ])
  // the bowl: an arc about (0, zc) from the bottom of the bowl to the rim
  .arc('bowl', { center: [0, 'zc'], start: [0, 'H - depth'],
    end: ['rin', 'H'] })

const cup = j.part('egg-cup')
  .params({
    egg: mm(43),            // a medium hen's egg is 42–44 mm across
    rin: 'egg / 2 - 1.5 mm',   // the egg rests on the rim, below its middle
    depth: 'egg / 2',       // the bowl holds the bottom half of the egg
    rim_d: 'egg + 7 mm',
    H: mm(45),              // overall height
    foot_d: mm(46), foot_h: mm(3),
    stem_d: mm(24), stem_z: mm(12),
    // a circle through (0, H − depth) and (rin, H) with its centre on the
    // axis: rin² + (H − zc)² = (H − depth − zc)²
    zc: 'H - (depth * depth - rin * rin) / (2 * depth)',
  })
  .configs({
    S: { egg: mm(40), H: mm(42), foot_d: mm(43) },
    M: {},
    L: { egg: mm(46), H: mm(48), foot_d: mm(49), stem_d: mm(26) },
  })
  .config('M')
  .expose(['egg', 'H', 'stem_d'], {
    labels: { egg: 'egg diameter', H: 'height', stem_d: 'stem diameter' },
    ranges: { egg: [mm(36), mm(52)], H: [mm(35), mm(70)],
      stem_d: [mm(14), mm(34)] },
  })
  .revolve(section.profiles(), j.axis.Z, turn(1), { id: 'body' })
  // round the rim inside and out. The foot's edge is on the bed: a chamfer
  // 0.4 mm in and 0.7 mm up, steeper than 45°
  .fillet(j.feat('body').sideFace('o.6').edges(), mm(1.5), { id: 'rim' })
  .chamfer(j.feat('body').sideFace('o.2').edges(), mm(0.7),
    { d2: mm(0.4), id: 'foot' })

// Upright: the cup flares out 22° from vertical and the bowl opens
// upward. Four cups, one plate.
return j.print('egg-cups', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
}).add('cup', cup, { qty: 4 }).orient('+Z')
