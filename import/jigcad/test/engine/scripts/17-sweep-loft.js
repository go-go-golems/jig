// A sweep along a helix (rotation-minimising frame) and a loft between a square and a circle.
const coil = j.part('coil')
  .sweep(j.sketch('c', { on: j.plane.XZ }).circle('w', 1, { at: [10, 0] }).profiles(), j.sketch3d('path').helix('h', { pitch: mm(4), turns: 3, r: mm(10) }), { id: 'wire' })
const transition = j.part('transition')
  .loft([j.sketch('a', { on: j.plane.XY }).rect('r', 20, 20, { center: true }).profiles(),
         j.sketch('b', { on: j.plane.offset(j.plane.XY, mm(30)) }).circle('c', 8).profiles()], { id: 'duct' })
return data.cfg?.which === 'loft' ? transition : coil
