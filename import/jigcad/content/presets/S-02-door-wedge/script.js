// S-02 · Door wedge with grip ribs: one sketch, one extrude,
// and a loop that writes the ribs.
// Notice that a script is JavaScript:
// the for loop adds three points per groove, each an expression of the params.
const grooves = 15   // grooves along the underside
// x of groove i, spread between the margins
const at = i => `margin + ${i} * (L - 2 * margin) / ${grooves - 1}`

// tip, up the slope, down the back
const pts = [[0, 0], [0, 'tip'], ['L', 'H'], ['L', 0]]
// back along the underside: a 90° V-groove at each station
for (let i = grooves - 1; i >= 0; i--) {
  pts.push([`${at(i)} + rib`, 0], [at(i), 'rib'], [`${at(i)} - rib`, 0])
}

const side = j.sketch('side', { on: j.plane.XZ })
  .polyline('outline', pts, { closed: true })
  // a circle inside the outline is a hole in the profile
  .circle('hang', 'hang_d / 2', { at: ['L - 12 mm', 'H / 2'] })

const wedge = j.part('door-wedge')
  .params({
    L: mm(120),       // length along the floor
    H: mm(28),        // height of the thick end:
                      // enough for a 15–20 mm gap under an interior door
    tip: mm(2),       // thickness at the thin end, so it slides under the door
    w: mm(35),        // width
    rib: mm(1.5),     // depth of each groove;
                      // the ribs between them bite into a carpet or a mat
    margin: mm(10),   // flat run at each end of the underside
    hang_d: mm(8),    // hole to hang it on a hook
  })
  .expose(['L', 'H', 'w', 'rib'], {
    labels: {
      L: 'length', H: 'height at the back',
      w: 'width', rib: 'groove depth',
    },
    ranges: {
      L: [mm(70), mm(180)], H: [mm(15), mm(45)],
      w: [mm(20), mm(60)], rib: [mm(0.6), mm(3)],
    },
  })
  .extrude(side.profiles(), 'w', { id: 'body' })

// On its side: the outline is the first layer,
// so the grooves and the hang hole need no support.
return j.print('door-wedge', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [wedge],
})
