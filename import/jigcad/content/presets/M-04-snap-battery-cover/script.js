// M-04 · Snap-fit battery cover: a box for two AA cells and a lid that
// clicks onto it with two cantilever hooks. Notice that the hooks are
// j.lib.snap.cantilever, which checks the strain in the beam as it compiles.

// AA cell (IEC 60086 LR6): Ø14.5 × 50.5 mm. Room for a spring contact and a
// flat contact makes the bay 56 mm long; two cells side by side, plus room
// for a hook at each side, make it 34 mm wide.
const bay = { w: 34, l: 56, depth: 15.5 }

// The hooks: 12 mm beams 1.4 mm thick that bend 1.0 mm (strain 1.5 %, 58 %
// of what PETG takes). They hang 0.2 mm off the side walls, so a barb goes
// 0.8 mm into its window. These are numbers because the hooks are placed
// with frames, and frames take numbers.
const snap = { L: 12, t: 1.4, y: 1.0, w: 8, off: 0.2 }
const hook = j.lib.snap.cantilever({ length: mm(snap.L),
  thickness: mm(snap.t), deflection: mm(snap.y), width: mm(snap.w),
  material: j.material('PETG') })
// beam centre to box centre, along X
const beamX = bay.w / 2 - snap.off - snap.t / 2

const box = j.part('battery-box')
  .params({
    wall: mm(2), floor: mm(1.6),
    H: `floor + ${bay.depth} mm`,
    rib: mm(5),        // divider between the cells
    // the window each barb clicks into: from below the beam's tip up to
    // 0.2 mm above the barb's flat retaining face (its back, 9.97 mm from
    // the root on a 12 mm beam with a 30° ramp and a 0.3 mm land)
    winLo: `H - ${snap.L} mm - 0.4 mm`, winHi: 'H - 9.97 mm + 0.2 mm',
  })
  .expose(['wall', 'floor', 'rib'], {
    labels: { wall: 'wall', floor: 'floor', rib: 'divider height' },
    ranges: { wall: [mm(1.6), mm(3)], floor: [mm(1.2), mm(3)],
      rib: [mm(0), mm(10)] },
  })
  .extrude(j.sketch('outline', { on: j.plane.XY })
    .rect('box', `${bay.w} mm + 2 * wall`, `${bay.l} mm + 2 * wall`,
      { center: true, r: 'wall' }).profiles(), 'H', { id: 'body' })
  .cut(j.sketch('bay', { on: j.plane.offset(j.plane.XY, 'H') })
    .rect('bay', `${bay.w} mm`, `${bay.l} mm`, { center: true }).profiles(),
  `${bay.depth} mm`, { id: 'bay' })
  .extrude(j.sketch('divider', { on: j.plane.offset(j.plane.XY, 'floor') })
    .rect('rib', mm(1.2), `${bay.l} mm`, { center: true }).profiles(), 'rib',
  { id: 'divider' })
  // one window through each side wall, cut from the YZ plane both ways
  .cut(j.sketch('windows', { on: j.plane.YZ })
    .rect('win', `${snap.w} mm + 0.6 mm`, 'winHi - winLo',
      { center: true, at: [0, '(winLo + winHi) / 2'] }).profiles(),
  { symmetric: `${bay.w} mm + 2 * wall + 2 mm` }, { id: 'windows' })
  .chamfer(j.feat('body').startFace().edges(), mm(0.4), { id: 'foot' })

// The lid, modelled the way it prints: outer face on the bed, hooks up, and
// 50 mm to the right of the box on the stage. On the box it is turned over,
// and each barb points out into a window.
const lidX = 50
const lid = j.part('lid')
  .params({ wall: mm(2), lidT: mm(1.6) })
  .extrude(j.sketch('plate', { on: j.plane.XY })
    .rect('lid', `${bay.w} mm + 2 * wall`, `${bay.l} mm + 2 * wall`,
      { center: true, at: [`${lidX} mm`, 0], r: 'wall' }).profiles(), 'lidT',
  { id: 'plate' })
  .add(hook, { at: j.frame({ origin: j.pt(lidX + beamX, 0, 1.6),
    x: j.dir('+X'), z: j.dir('+Z') }), id: 'hookR' })
  .add(hook, { at: j.frame({ origin: j.pt(lidX - beamX, 0, 1.6),
    x: j.dir('-X'), z: j.dir('+Z') }), id: 'hookL' })
  .chamfer(j.feat('plate').startFace().edges(), mm(0.4), { id: 'foot' })

// PETG for the hooks' sake: they bend every time the lid comes off.
return j.print('battery-box', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [box, lid],
}).orient('+Z')
