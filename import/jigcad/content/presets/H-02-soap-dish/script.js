// H-02 · Soap dish with drain slots: a dish whose floor is a row of slats,
// with channels under the walls so the water runs away.
// Notice that nothing overhangs: the slots go down to the bed, so every
// slat stands on it, and the channels under the walls have pointed roofs.
const pocket = j.sketch('pocket', { on: j.plane.offset(j.plane.XY, 'H') })
  .rect('r', 'W - 2 * wall', 'D - 2 * wall',
    { center: true, r: 'r - wall' })

// one slot along Y, patterned across the floor; x0 is the first slot
const x0 = '-(n - 1) * pitch / 2'
const slots = j.sketch('slots', { on: j.plane.offset(j.plane.XY, 'top') })
  .rect('s', 'slot_w', 'len', { center: true, at: [x0, 0] })
  .pattern(['s'], j.pattern.linear(j.dir('+X'), { count: 'n', step: 'pitch' }))

// the same rows, low and long, as tunnels under the front and back walls:
// a 45° roof prints without support, where a flat one would bridge
const channels = j.sketch('channels', { on: j.plane.XZ })
  .polyline('c', [[`${x0} - slot_w / 2`, 0], [`${x0} + slot_w / 2`, 0],
    [`${x0} + slot_w / 2`, 'lift - slot_w / 2'], [x0, 'lift'],
    [`${x0} - slot_w / 2`, 'lift - slot_w / 2']], { closed: true })
  .pattern(['c'], j.pattern.linear(j.dir('+X'), { count: 'n', step: 'pitch' }))

const dish = j.part('soap-dish')
  .params({
    W: mm(110), D: mm(75), H: mm(20),  // a bar of soap is about 90 × 60
    r: mm(14),          // corner radius
    wall: lw(5),        // 2.25 mm
    lift: mm(4),        // height of the water channels under the slats
    floor: layer(10),   // 2 mm of slat above the channels
    top: 'lift + floor',             // the floor the soap rests on
    slot_w: mm(3),      // drain slot width: soap does not fall through
    pitch: mm(9),       // slot to slot: a 6 mm slat between each pair
    len: 'D - 2 * wall - 16 mm',     // slot length, clear of the scoop
    n: 'floor((W - 2 * wall - 20 mm) / pitch) + 1',   // slots that fit
  })
  .expose(['W', 'D', 'H', 'pitch'], {
    labels: { W: 'length', D: 'width', H: 'height',
      pitch: 'slot spacing' },
    ranges: { W: [mm(70), mm(160)], D: [mm(50), mm(110)],
      H: [mm(12), mm(35)], pitch: [mm(6), mm(14)] },
  })
  .extrude(j.region.rect('W', 'D', { r: 'r' }), 'H', { id: 'body' })
  // bed edges first, while the outline is still eight edges
  .chamfer(j.feat('body').startFace().edges(), mm(0.5), { id: 'foot' })
  .cut(pocket.profiles(), 'H - top', { id: 'well' })
  .cut(channels.profiles(), { symmetric: 'D + 2 mm' }, { id: 'channels' })
  // each slot only needs to go down through the slat into the channel
  // below it; negative, because material lies on both sides of the plane
  .cut(slots.profiles(), '-(floor + slot_w / 2)', { id: 'slots' })
  .fillet(j.feat('well').edges().where(e => e.concave), mm(5),
    { id: 'scoop' })
  .fillet(j.feat('body').endFace().edges(), mm(1), { id: 'rim' })

// Flat on the bed, PETG for the shower.
return j.print('soap-dish', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [dish],
}).orient('+Z')
