// M-06 · Threaded jar: a Ø64 mm jar and a screw lid that closes in a turn
// and a quarter. Notice that the neck and the lid share one thread spec, a
// two-start Ø56 × 4 mm thread: two teeth side by side, 8 mm of lead.

// The sizes are numbers because the threads are placed with transforms and
// frames, and those take numbers.
const R = 32, wall = 2, Hb = 50       // body radius, wall, straight height
const spec = { d: mm(56), pitch: mm(4) }
const thread = { length: mm(10), starts: 2 }
const rn = 25.6           // neck outside: just inside the thread's root
const neckH = 12          // neck above the shoulder; thread from 1.5 mm up
// top of the shoulder: it rises 1.2 for every 1 it steps in (50°), so its
// inside, which faces down, stays 40° from vertical
const zs = Hb + 1.2 * (R - rn)
const top = zs + neckH

const jar = j.part('jar')
  // body, shoulder and neck as one turned outline, then hollowed
  .revolve(j.sketch('section', { on: j.plane.XZ }).polyline('outline', [
    [0, 0], [R, 0], [R, Hb], [rn, zs], [rn, top], [0, top],
  ], { closed: true }).profiles(), j.axis.Z, turn(1), { id: 'body' })
  .shell(j.sel.faces('>Z'), mm(wall), { direction: 'in', id: 'walls' })
  .add(j.lib.thread(spec, thread),
    { at: j.tx.move(0, 0, zs + 1.5), id: 'thread' })
  // the thread is a solid rod: bore the neck out again, down to the shoulder
  .cut(j.sketch('mouth', { on: j.plane.offset(j.plane.XY, mm(top)) })
    .circle('c', mm(rn - wall)).profiles(), mm(neckH), { id: 'mouth' })
  .chamfer(j.sel.faces('<Z').edges(), mm(0.6), { id: 'foot' })

// The lid, modelled as it prints (top on the bed, skirt up) and 75 mm to the
// right of the jar on the stage. The neck's top seats against the lid's
// ceiling, and the skirt stops 1 mm above the shoulder.
const lidTop = 2.4, depth = neckH - 1, H = lidTop + depth, lx = 75
const lid = j.part('lid')
  .extrude(j.sketch('disc', { on: j.plane.XY })
    .circle('c', mm(R), { at: [lx, 0] }).profiles(), mm(H), { id: 'cap' })
  .cut(j.sketch('bore', { on: j.plane.offset(j.plane.XY, mm(H)) })
    .circle('c', mm(26.1), { at: [lx, 0] }).profiles(), mm(depth),
  { id: 'bore' })
  // the same thread, cut 10 mm down from the rim
  .add(j.lib.thread(spec, { ...thread, internal: true }), {
    at: j.frame({ origin: j.pt(lx, 0, H), x: j.dir('+X'), z: j.dir('-Z') }),
    id: 'thread',
  })
  // 24 flutes round the outside to grip it by
  .cut(j.sketch('flutes', { on: j.plane.XY })
    .circle('f', mm(1.6), { at: [lx + R + 0.6, 0] })
    .pattern(['f'], j.pattern.circular(
      j.axis.through(j.pt(lx, 0, 0), j.pt(lx, 0, 1)), { count: 24 }))
    .profiles(), { through: 'all' }, { id: 'flutes' })
  .chamfer(j.feat('cap').startFace().edges(), mm(0.6), { id: 'foot' })

// Both upright: the threads' axes vertical, so every turn prints round.
return j.print('jar', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [jar, lid],
}).orient('+Z')
