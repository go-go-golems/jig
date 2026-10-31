// A bar with a horizontal hole: printed with +Z up, the hole becomes a 45° teardrop pointing up.
const bar = j.part('bar')
  .add(j.box(40, 12, 12), { id: 'block' })
  .hole(j.sketch('hc', { on: j.plane.XZ }).point('p', [20, 6]), j.hole.simple(mm(5)), { id: 'cross' })
return j.print('bar', { parts: [bar] }).orient('+Z')
