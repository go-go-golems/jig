// S-10 · Phone stand: a side profile with a leaning back, a front lip and a
// notch for the charging cable.
// Notice the angle: the back's corners are expressions in sin and cos of
// `angle`, so the whole profile follows when you tilt it.
const side = j.sketch('side', { on: j.plane.XZ })   // x to the front, z up
  .polyline('p', [
    [0, 0], ['L', 0], ['L', 'b + lip'],            // base and front of lip
    ['L - lip_t', 'b + lip'], ['L - lip_t', 'b'],  // back of the lip
    ['x0', 'b'],                                   // the seat for the phone
    ['top_x', 'top_z'],                            // up the phone's back
    ['top_x - t * sin(angle)', 'top_z - t * cos(angle)'],   // top of the back
    ['foot_x', 'b'], [0, 'b'],                     // down to the base
  ], { closed: true })

// a notch through the seat, lip and base, so the plug goes straight down
// into the phone and the cable leaves under the front
const notch = j.sketch('notch', { on: j.plane.XY })
  .rect('n', 'L - x0 + 1 mm', 'plug', { center: true,
    at: ['(x0 + L + 1 mm) / 2', 0] })

const stand = j.part('phone-stand')
  .params({
    angle: deg(65),   // the phone's tilt from the desk: 60–70° for reading
    phone: mm(13),    // room for the phone's thickness, case included
    S: mm(75),        // length of the back, along the phone
    L: mm(85),        // base depth, front to back
    w: mm(70),        // width
    b: mm(5),         // base thickness
    t: mm(6),         // thickness of the back
    lip: mm(8),       // lip height above the seat
    lip_t: mm(5),
    plug: mm(13),     // cable notch: a USB-C plug body is about 12 × 7 mm
    x0: 'L - lip_t - phone',                 // where the phone's back rests
    top_x: 'x0 - S * cos(angle)',            // the top of the back
    top_z: 'b + S * sin(angle)',
    // where the back face of the back meets the base
    foot_x: 'top_x - t * sin(angle) + (S * sin(angle) - t * cos(angle))'
      + ' / tan(angle)',
  })
  .configs({
    phone: {},
    tablet: { S: mm(120), L: mm(120), w: mm(140), phone: mm(15),
      lip: mm(10), t: mm(7), plug: mm(16) },
  })
  .config('phone')
  .expose(['angle', 'phone', 'S', 'w'], {
    labels: { angle: 'tilt from the desk', phone: 'phone thickness',
      S: 'height of the back', w: 'width' },
    ranges: { angle: [deg(50), deg(80)], phone: [mm(8), mm(20)],
      S: [mm(40), mm(140)], w: [mm(40), mm(160)] },
  })
  .extrude(side.profiles(), { symmetric: 'w' }, { id: 'body' })
  .cut(notch.profiles(), { through: 'all' }, { id: 'cable' })
  // the root of the back carries the load: a large fillet behind it;
  // the other inside corners get a small one so the phone still seats
  .fillet(j.feat('body').sideFace('p.8').edges('|Y')
    .and(j.feat('body').sideFace('p.9').edges()), mm(10), { id: 'root' })
  .fillet(j.feat('body').edges('|Y').where(e => e.convex && e.center.z > 1),
    mm(1.5), { id: 'round' })
  // bed edges get a chamfer, not a fillet
  .chamfer(j.feat('body').faces('<Z').edges(), mm(0.6), { id: 'foot' })

// Upright on its base: the back leans 25° from vertical, inside 45°, and
// the notch is a straight cut with nothing over it.
return j.print('phone-stand', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [stand],
}).orient('+Z')
