// M-03 · Dovetail tray: a desk tray module with a tail at one end and a
// socket at the other, so any number of them slide together into a row.
// Notice that tail and socket are one library feature, j.lib.dovetail: the
// tail is joined as modelled, the socket is cut wider by the fit gap.

// The module's size is in numbers because the dovetail frames below are
// placed with numbers: W along X (tail not counted), D along Y, H tall.
const W = 80, D = 60, H = 30

// Both dovetails run up the end walls (frame y = +Z), so they are prisms
// standing on the bed and print without overhangs. The frame's z is the
// face's outward normal: the tail grows along it, the socket cuts against it.
const tailAt = j.frame({ origin: j.pt(W / 2, 0, H / 2), x: j.dir('+Y'),
  z: j.dir('+X') })
const socketAt = j.frame({ origin: j.pt(-W / 2, 0, H / 2), x: j.dir('-Y'),
  z: j.dir('-X') })
const dovetail = j.lib.dovetail({ width: mm(14), depth: mm(5),
  angle: deg(15), fit: 'slide', length: mm(H) })

const tray = j.part('tray-module')
  .params({
    side: lw(4),       // side walls: four lines
    end: mm(8),        // end walls: thick enough for the 5 mm socket
    floor: layer(8),
    r: mm(4),          // outside corner radius
  })
  .expose(['side', 'end', 'floor'], {
    labels: { side: 'side wall', end: 'end wall', floor: 'floor' },
    ranges: { side: [mm(1.2), mm(4)], end: [mm(7), mm(14)],
      floor: [mm(1), mm(4)] },
  })
  .extrude(j.sketch('outline', { on: j.plane.XY })
    .rect('box', `${W} mm`, `${D} mm`, { center: true, r: 'r' }).profiles(),
  `${H} mm`, { id: 'body' })
  .cut(j.sketch('pocket', { on: j.plane.offset(j.plane.XY, `${H} mm`) })
    .rect('well', `${W} mm - 2 * end`, `${D} mm - 2 * side`,
      { center: true, r: 'r - side' }).profiles(),
  `${H} mm - floor`, { id: 'pocket' })
  .add(dovetail, { at: tailAt, op: 'join', id: 'tail' })
  .add(dovetail, { at: socketAt, op: 'cut', id: 'socket' })
  // 0.4 mm off every bed edge: no elephant's foot to jam the dovetail
  .chamfer(j.sel.faces('<Z').edges(), mm(0.4), { id: 'foot' })

// Two modules (add more with qty): print them, then slide each tail down
// into the next one's socket.
return j.print('dovetail-tray', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
}).add('module', tray, { qty: 2 }).orient('+Z')
