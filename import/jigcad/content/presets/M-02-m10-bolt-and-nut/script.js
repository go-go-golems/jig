// M-02 · M10 bolt and nut: a fully threaded M10 × 25 hex bolt and its nut.
// Notice that both threads come from j.lib.thread('M10'): the same spec
// grows into the bolt and cuts into the nut, each side by its fit gap.

// ISO 4017 / ISO 4032, M10 coarse: pitch 1.5 mm, 16 mm across flats, head
// 6.4 mm, nut 8.4 mm.
const hex = (id, at) => j.sketch(id, { on: j.plane.XY })
  .polygon('hex', 6, 's / sqrt(3)', { at })

const bolt = j.part('bolt')
  .params({
    s: mm(16),        // across flats
    k: mm(6.4),       // head height
    L: mm(25),        // under the head, all threaded (20 mm fails to fuse here)
    tip: mm(1),       // 45° lead-in at the end of the thread
  })
  .expose(['L'], { labels: { L: 'length under the head' },
    ranges: { L: [mm(10), mm(40)] } })
  .extrude(hex('head', [0, 0]).profiles(), 'k', { id: 'head' })
  // a 0.8 mm chamfer round the head's top face, which lies on the bed:
  // no elephant's foot, and the crown a real bolt has
  .chamfer(j.feat('head').startFace().edges(), mm(0.8), { id: 'crown' })
  // the thread grows from the head's underside, which faces +Z here
  .add(j.lib.thread('M10', { length: 'L' }),
    { at: j.frame.on(j.feat('head').endFace()), id: 'thread' })
  // the lead-in: a 45° triangle turned round the axis, from 1 mm inside the
  // crests at the end out past them
  .revolve(j.sketch('lead', { on: j.plane.XZ }).polyline('cut', [
    ['5 mm - tip', 'k + L'], ['6 mm', 'k + L'], ['6 mm', 'k + L - 1 mm - tip'],
  ], { closed: true }).profiles(), j.axis.Z, turn(1), { op: 'cut', id: 'tip' })

// The nut stands 30 mm to the right of the bolt on the stage; the job packs
// the plate anyway.
const nut = j.part('nut')
  .params({ s: mm(16), m: mm(8.4), x: mm(30) })
  .extrude(hex('body', ['x', 0]).profiles(), 'm', { id: 'body' })
  .chamfer(j.feat('body').startFace().edges(), mm(0.8), { id: 'under' })
  .chamfer(j.feat('body').endFace().edges(), mm(0.8), { id: 'over' })
  // cut down from the top face's centre: the frame flipped to point into
  // the nut
  .add(j.lib.thread('M10', { length: 'm', internal: true }),
    { at: j.frame.on(j.feat('body').endFace(), { flip: true }), id: 'thread' })

// Bolt on its head, thread up: the flanks print as round as they can. The
// nut lies flat.
return j.print('m10-bolt-and-nut', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [bolt, nut],
}).orient('+Z')
