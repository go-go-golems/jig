// A-01 · A box with walls: one sketch, one extrude, one shell.
// Every size is a param, so Params can change it and the Trace shows what
// was computed again.
return j.part('box')
  .params({
    w: mm(60), d: mm(40),
    h: mm(30), wall: mm(2),
    r: mm(3), inner_w: 'w - 2 * wall',
  })
  .expose(['w', 'd', 'h', 'wall'], {
    labels: {
      w: 'outside width', d: 'outside depth',
      h: 'height', wall: 'wall thickness',
    },
    ranges: {
      w: [mm(30), mm(120)], d: [mm(20), mm(100)],
      h: [mm(10), mm(80)], wall: [mm(0.8), mm(5)],
    },
  })
  .extrude(
    j.sketch('base', { on: j.plane.XY })
      .rect('outline', 'w', 'd', { center: true, r: 'r' })
      .profiles(),
    'h', { id: 'body' })
  .shell(j.feat('body').endFace(), 'wall', { direction: 'in', id: 'shell' })
