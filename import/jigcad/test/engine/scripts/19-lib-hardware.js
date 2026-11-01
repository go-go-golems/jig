// Library hardware: a heat-set insert boss on a floor and a magnet pocket cut into the floor from its top face.
const shell = j.part('case').material(j.material('PETG'))
  .extrude(j.sketch('b', { on: j.plane.XY }).rect('r', 60, 40, { center: true, r: 4 }).profiles(), mm(20), { id: 'body' })
  .shell(j.feat('body').endFace(), lw(4), { id: 'walls' })
return shell
  .add(j.lib.insert('M3x5.7').boss({ wall: lw(3) }), { at: j.tx.move(-20, -10, 1.8), id: 'boss' })
  .add(j.lib.magnet({ d: mm(6), h: mm(3) }), { at: j.tx.move(15, 0, lw(4)), op: 'cut', id: 'magnet' })
