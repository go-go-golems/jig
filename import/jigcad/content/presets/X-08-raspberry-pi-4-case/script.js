// X-08 · Raspberry Pi 4 case: a base and a lid, two bodies of one part on
// one plate. The board sits on four standoffs with M2.5 heat-set inserts;
// four M2.5 screws come down through tubes in the lid and the board's holes
// into the inserts, so one set of screws holds lid, board and base.
// Every socket opening comes from the table in pi4.json, and the case
// splits at the underside of the board, so each opening is a notch from an
// edge: neither piece needs a bridge.
// Board: 85 × 56 mm, M2.5 holes 3.5 mm in from three edges on a
// 58 × 49 mm rectangle (Raspberry Pi 4 Model B mechanical drawing).
// The base is drawn as it sits, the board's centre at the origin; the lid
// as it prints, turned over about X and moved `lid_y` along Y, so a point
// (x, y, z) of the closed case is (x, lid_y − y, top − z) on the lid.
const B = data.pi4
const bx = x => `${x} mm - bl / 2`      // board coordinates → world
const by = y => `${y} mm - bw / 2`
const ly = y => `lid_y - (${by(y)})`    // … and on the turned-over lid

const P = {
  bl: mm(B.board.l), bw: mm(B.board.w), bt: mm(B.board.t),
  clear: mm(1), over: mm(3),   // round the board; more where sockets stand out
  wall: lw(4), floor: layer(8),
  standoff: mm(4),             // under the board: its pins and the SD card
  board_z: 'floor + standoff', top_z: 'board_z + bt',
  roof_z: 'top_z + 18 mm',     // the USB stacks are 16 mm tall
  top: 'roof_z + wall',        // top of the closed case
  iw: 'bl + clear + over', id_: 'bw + 2 * clear', cx: '(over - clear) / 2',
  W: 'iw + 2 * wall', D: 'id_ + 2 * wall',
  gap: mm(1),                  // round each socket
  post: mm(6),                 // standoffs and tubes: inside the Ø6 pads
  vent_n: 7,
  lid_y: 'D + 6 mm',           // where the lid lies on the plate
}
const outline = (id, y0) => j.sketch(id, { on: j.plane.XY })
  .rect('r', 'W', 'D', { center: true, at: ['cx', y0], r: mm(4) })
const holesAt = (id, z, yOf) => B.holes.reduce((sk, [x, y], k) =>
  sk.circle(`h${k + 1}`, 'post / 2', { at: [bx(x), yOf(y)] }),
j.sketch(id, { on: j.plane.offset(j.plane.XY, z) }))

// A socket's opening: a rectangle on a plane just outside its wall, `gap`
// wider than the socket each side, cut inwards through the wall. In the
// closed case it runs from the split (z0) to the socket's top (z1); the SD
// card, under the board, gets a notch down from the top of the base.
const opening = (part, p) => {
  const inBase = p.z0 < 0
  const z0 = inBase ? `board_z + ${p.z0} mm - gap` : 'board_z - 1 mm'
  const z1 = inBase ? 'board_z + 1 mm' : `top_z + ${p.h} mm + gap`
  // on the lid, heights are measured down from the top of the case
  const [a, b] = inBase ? [z0, z1] : [`top - (${z1})`, `top - (${z0})`]
  const wall = {
    // the front wall is at y = −D / 2 on the base, lid_y + D / 2 on the lid
    front: { plane: j.plane.offset(j.plane.XZ, '-(lid_y + D / 2 + 1 mm)'),
      u: bx(p.at), into: 'wall + 2 mm' },
    right: { plane: j.plane.offset(j.plane.YZ, 'cx + W / 2 + 1 mm'),
      u: inBase ? by(p.at) : ly(p.at), into: '-(wall + 2 mm)' },
    left: { plane: j.plane.offset(j.plane.YZ, 'cx - W / 2 - 1 mm'),
      u: inBase ? by(p.at) : ly(p.at), into: 'wall + 2 mm' },
  }[p.edge]
  const sk = j.sketch(p.name, { on: wall.plane })
    .rect('o', `${p.w} mm + 2 * gap`, `(${b}) - (${a})`,
      { center: true, at: [wall.u, `((${a}) + (${b})) / 2`] })
  return part.cut(sk.profiles(), wall.into, { id: p.name })
}

let pi = j.part('pi4-case')
  .params(P)
  .expose(['standoff', 'clear', 'over'], {
    labels: { standoff: 'height under the board',
      clear: 'room round the board', over: 'room at the USB end' },
    ranges: { standoff: [mm(3), mm(10)], clear: [mm(0.5), mm(4)],
      over: [mm(1), mm(6)] },
  })
  // the base: a tray as tall as the board's underside, with standoffs
  .extrude(outline('base', '0 mm').profiles(), 'board_z', { id: 'base' })
  .shell(j.feat('base').endFace(), 'wall', { id: 'tray' })
  .extrude(holesAt('posts', 'floor', by).profiles(), 'standoff',
    { id: 'posts' })
  .hole(holesAt('insert-at', 'board_z', by), j.hole.insert('M2.5x4'),
    { id: 'inserts' })
  .chamfer(j.feat('base').startFace().edges(), mm(0.5), { id: 'foot' })
  // the lid, turned over: a shell open upwards, its roof on the bed
  .extrude(outline('lid', 'lid_y').profiles(), 'top - board_z', { id: 'lid' })
  .shell(j.feat('lid').endFace(), 'wall', { id: 'cover' })
  // tubes from the roof to the board's top face, over the holes
  .extrude(holesAt('tubes', '0 mm', ly).profiles(), 'top - top_z',
    { id: 'tubes' })
  .hole(B.holes.map(([x, y]) => j.pt(bx(x), ly(y), 0)),
    j.hole.clearance('M2.5', { fit: 'free' }), { id: 'screws' })
  // vents over the processor: slots through the roof
  .cut(j.sketch('vent', { on: j.plane.XY })
    .slot('s', [bx(16), ly(14)], [bx(16), ly(42)], mm(2.5)).profiles(),
  'wall + 1 mm', { id: 'vent' })
  .pattern(j.feat('vent'), j.pattern.linear(j.dir('+X'),
    { count: 'vent_n', step: mm(5) }), { id: 'vents' })
pi = B.ports.reduce(opening, pi)

// One plate, as drawn: the base upright, the lid on its roof, so every
// opening is a notch that opens upwards and the vents go through the
// first layers.
return j.print('pi4-case', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [pi],
}).orient('+Z').use(j.rules.fdm)
