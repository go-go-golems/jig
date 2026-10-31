// S-05 · Bag clip: a hexagonal rod and a slotted sleeve, two parts, one plate.
// Notice the bore: a hole with a fit class, so its size comes from the slide
// clearance, and it prints as a teardrop because it lies across the build.
const P = {
  L: mm(110),     // sleeve length: a crisp packet is 130–180 mm wide and is
                  // folded once before clipping
  rod: mm(10),    // hexagonal rod, measured across its corners
  bag: mm(0.3),   // room for the folded film: two layers of a 0.05–0.1 mm
                  // bag, plus slack
  wall: mm(3),    // sleeve wall round the bore
  grip: mm(8),    // the rod stands out of the sleeve by this much: a handle
  slot: 'rod * 0.6',  // the film leaves through this slot; it is narrower
                      // than the rod across its flats (0.87 × rod), so the
                      // rod cannot escape
  H: 'rod + 2 * wall',  // sleeve height and width
}

// Both parts are modelled where they sit in use, on the bore's axis at
// z = H / 2; the print job lays them out side by side on the plate.
// The rod lies on a flat: the hexagon's flat sides face up and down.
const hex = j.sketch('hex', { on: j.plane.YZ })
  .polygon('section', 6, 'rod / 2', { at: [0, 'H / 2'] })
const rod = j.part('rod')
  .params(P)
  .expose(['L', 'rod'], {
    labels: { L: 'clip length', rod: 'rod size across corners' },
    ranges: { L: [mm(60), mm(200)], rod: [mm(6), mm(16)] },
  })
  .extrude(hex.profiles(), 'L + grip', { id: 'rod' })

// The sleeve: a square tube along X with 45° corners (a chamfered corner
// prints without support; a round one on the bed would not), bored for the
// rod and slotted along the top.
const start = j.plane.offset(j.plane.YZ, 'grip')
const section = j.sketch('outer', { on: start })
  .polyline('section', [
    ['-H / 2 + wall', 0], ['H / 2 - wall', 0], ['H / 2', 'wall'],
    ['H / 2', 'H - wall'], ['H / 2 - wall', 'H'], ['-H / 2 + wall', 'H'],
    ['-H / 2', 'H - wall'], ['-H / 2', 'wall'],
  ], { closed: true })
const slit = j.sketch('slit', { on: start })
  .rect('gap', 'slot', 'H', { center: true, at: [0, 'H'] })

const sleeve = j.part('sleeve')
  .params(P)
  .expose(['L', 'rod', 'bag', 'wall'], {
    labels: {
      L: 'clip length', rod: 'rod size across corners',
      bag: 'room for the bag film', wall: 'sleeve wall',
    },
    ranges: {
      L: [mm(60), mm(200)], rod: [mm(6), mm(16)],
      bag: [mm(0), mm(1)], wall: [mm(1.6), mm(5)],
    },
  })
  .extrude(section.profiles(), 'L', { id: 'tube' })
  .hole([j.pt('grip', 0, 'H / 2')],
    j.hole.simple(j.fit.hole('rod + 2 * bag', 'slide')), { id: 'bore' })
  .cut(slit.profiles(), 'L', { id: 'slot' })

// Orientation is automatic: both parts lie along the bed, the sleeve on its
// flat bottom, so its bore is a teardrop whose tip the slot removes.
return j.print('bag-clip', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [rod, sleeve],
})
