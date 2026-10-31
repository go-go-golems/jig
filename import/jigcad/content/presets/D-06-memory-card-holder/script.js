// D-06 · Memory-card holder: one column of upright slots per card format,
// laid out from a table. Notice that the table (cards.csv) decides the
// columns, and that the block's size is an expression built from its rows.
// Card sizes (SD Association): SD 32 × 24 × 2.1 mm,
// microSD 15 × 11 × 1.0 mm.
const cards = data.cards.rows        // card, label, w, t, h, count (mm)
const n = cards.length

// Expressions built from the table: the block grows with every new row.
const sum = f => cards.map(f).join(' + ')
const widthOf = cards.map(r => `${r.w} mm + 2 * gap`)
const lengthOf = cards.map(r =>
  `${r.count} * (${r.t} mm + 2 * gap) + ${r.count - 1} * web`)

let holder = j.part('card-holder')
  .params({
    gap: mm(0.25),        // per side: a card drops in and stands upright
    web: mm(2.5),         // plastic between two cards of one column
    wall: mm(4),          // between columns and round the edge
    hold: 0.5,            // how much of a card's height sits in its slot
    floor: layer(8),      // 1.6 mm under the deepest slot
    label: mm(9),         // band in front of the slots for the engraved name
    text: mm(3.5),        // cap height of the names
    W: `${sum(r => `${r.w} mm`)} + ${2 * n} * gap + ${n + 1} * wall`,
    D: `max(${lengthOf.join(', ')}) + label + wall`,
    H: `floor + hold * ${Math.max(...cards.map(r => r.h))} mm`,
  })
  .expose(['gap', 'web', 'hold'], {
    labels: {
      gap: 'gap on each side of a card', web: 'web between cards',
      hold: 'share of the card held',
    },
    ranges: {
      gap: [mm(0.1), mm(0.5)], web: [mm(1.5), mm(5)], hold: [0.3, 0.7],
    },
  })
  .extrude(j.sketch('base', { on: j.plane.XY })
    .rect('r', 'W', 'D', { at: [0, 0], r: mm(3) }).profiles(),
  'H', { id: 'body' })

// The top face; largest() because the islands of an engraved D or O are
// pieces of it too.
const top = j.feat('body').endFace().largest()

// One cut per row of the table: a slot at the front of its column, patterned
// back along +Y. x0 is the left edge of the column.
cards.forEach((r, k) => {
  const x0 = `${k + 1} * wall + ${k} * 2 * gap` +
    cards.slice(0, k).map(c => ` + ${c.w} mm`).join('')
  const slots = j.sketch(`slots-${r.card}`,
    { on: j.plane.offset(j.plane.XY, 'H') })
    .rect('s', widthOf[k], `${r.t} mm + 2 * gap`, { at: [x0, 'label'] })
    .pattern(['s'], j.pattern.linear(j.dir('+Y'),
      { count: r.count, step: `${r.t} mm + 2 * gap + web` }))
  holder = holder
    .cut(slots.profiles(), `-hold * ${r.h} mm`, { id: `slots-${r.card}` })
    .emboss(j.region.text(r.label, {
      size: 'text', align: 'center', valign: 'middle',
      at: [`${x0} + (${widthOf[k]}) / 2`, 'label / 2'],
    }), mm(0.6), { on: top, op: 'cut', id: `name-${r.card}` })
})

holder = holder
  .chamfer(j.feat('body').startFace().edges(), mm(0.5), { id: 'foot' })

// Upright: the slots are vertical, so their thin walls print as true webs.
return j.print('card-holder', {
  printer: j.printer('generic-fdm'), material: j.material('PLA'),
  parts: [holder],
}).orient('+Z').use(j.rules.fdm)
