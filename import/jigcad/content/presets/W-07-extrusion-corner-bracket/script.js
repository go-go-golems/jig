// W-07 · Corner bracket for aluminium extrusion: an inside corner bracket
// with keys that register in the T-slots, for 2020, 3030 or 4040 profile
// picked from a table. Notice the keys: each is a fit-class gap narrower
// than the slot, so the bracket drops in square and cannot twist.
// Slots: 2020 has 6.2 mm slots and M5 screws, 3030 and 4040 8.2 mm slots
// with M6 and M8 screws (B-type profile).
const profiles = j.table([data.profiles.columns, ...data.profiles.rows
  .map(r => data.profiles.columns.map(c => String(r[c])))])

// Side view on XZ: extrusion A runs along X under z = 0, extrusion B stands
// at x < 0; the bracket fills the corner. Everything is extruded along −Y
// from y = 0, the face that goes on the bed.
const L = j.sketch('L', { on: j.plane.XZ })
  .polyline('p', [[0, 0], ['leg', 0], ['leg', 't'], ['t', 't'], ['t', 'leg'],
    [0, 'leg']], { closed: true })
const web = j.sketch('web', { on: j.plane.XZ })
  .polyline('w', [['t', 't'], ['leg', 't'], ['t', 'leg']], { closed: true })
// The two keys, centred on the slot, each drawn as its cross-section and
// extruded along its leg, stopping `relief` short of the corner. The side
// that faces the bed when printed slopes at 45°, so it needs no support.
const keyA = j.sketch('key-a', { on: j.plane.offset(j.plane.YZ, 'relief') })
  .polyline('k', [                      // x is world Y, y is world Z
    ['-size / 2 - key / 2', 0], ['-size / 2 + key / 2', 0],
    ['-size / 2 + key / 2 - key_h', '-key_h'],
    ['-size / 2 - key / 2', '-key_h'],
  ], { closed: true })
const keyB = j.sketch('key-b', { on: j.plane.offset(j.plane.XY, 'relief') })
  .polyline('k', [                      // x is world X, y is world Y
    [0, '-size / 2 - key / 2'], [0, '-size / 2 + key / 2'],
    ['-key_h', '-size / 2 + key / 2 - key_h'],
    ['-key_h', '-size / 2 - key / 2'],
  ], { closed: true })

const bracket = j.part('corner-bracket')
  .params({
    size: mm(20), slot: mm(6.2), screw_d: mm(5),   // from the table
    gap: mm(0.2),          // per side of a key: the slide class
    key: 'slot - 2 * gap', // key width
    key_h: mm(1.5),        // how far a key sits in the slot
    relief: mm(1),         // keys stop short of the corner
    leg: '1.4 * size',     // 28 mm for 2020
    t: '0.25 * size',      // 5 mm for 2020
    web_t: '0.2 * size',   // the web, flush with the face on the bed
    hole_at: 'leg - size / 2',   // screw centres from the corner
  })
  .configs(profiles)       // 2020, 3030, 4040; with none chosen, 3030
  .config('2020')
  .expose(['gap', 'key_h'], {
    labels: { gap: 'gap each side of a key', key_h: 'key height' },
    ranges: { gap: [mm(0.05), mm(0.4)], key_h: [mm(0.8), mm(2.5)] },
  })
  .extrude(L.profiles(), 'size', { id: 'body' })
  .extrude(web.profiles(), 'web_t', { id: 'web' })
  .extrude(keyA.profiles(), 'leg - relief', { id: 'key-a' })
  .extrude(keyB.profiles(), 'leg - relief', { id: 'key-b' })
  // one screw through each leg and key into a T-nut: a free clearance
  .hole([j.pt('hole_at', '-size / 2', 't'), j.pt('t', '-size / 2', 'hole_at')],
    j.hole.simple(j.fit.hole('screw_d', 'free')), { id: 'screws' })

// On its side, −Y up: the face at y = 0, with the web, lies on the bed; the
// keys lie along the bed with their 45° side down and the screw holes
// become teardrops.
return j.print('corner-bracket', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [bracket],
}).orient('-Y').use(j.rules.fdm)
