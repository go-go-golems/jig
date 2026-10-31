// W-08 · Spacer and standoff set: round spacers for M2.5, M3 and M4 screws
// and hexagonal M3 standoffs with heat-set inserts, every size from a table
// (spacers.json), laid out as one part with a body per piece.
// Notice that each row of the table is one hole feature: it drills every
// piece of the row at once, with the bore sized by a fit class.
const rows = data.spacers

let set = j.part('spacer-set')
  .params({
    spacing: mm(5),        // between pieces on the plate
    row_gap: mm(6),        // between rows
  })
  .expose(['spacing', 'row_gap'], {
    labels: { spacing: 'space between pieces', row_gap: 'space between rows' },
    ranges: { spacing: [mm(2), mm(15)], row_gap: [mm(2), mm(15)] },
  })

// row r sits at y_r: the sum of the rows before it, as an expression
const yOf = r => rows.slice(0, r)
  .map(x => `${x.od} mm + row_gap`).concat(['0 mm']).join(' + ')

rows.forEach((row, r) => {
  // one sketch per row with a circle per piece: its outline, and the
  // positions the hole feature drills at
  let marks = j.sketch(`at-${row.name}`, { on: j.plane.XY })
  row.lengths.forEach((len, k) => {
    const id = `${row.name}-${len}`      // e.g. M3-10: an M3 spacer, 10 mm long
    const at = [`${k} * (${row.od} mm + spacing)`, yOf(r)]
    const outline = row.kind === 'standoff'
      // across the flats `od`: an M3 standoff takes a 5.5 mm spanner
      ? j.sketch(id, { on: j.plane.XY }).polygon('o', 6, `${row.od} mm / 2`,
        { inscribed: false, at })
      : j.sketch(id, { on: j.plane.XY }).circle('o', `${row.od} mm / 2`, { at })
    set = set.extrude(outline.profiles(), mm(len), { id })
    marks = marks.circle(`c${k}`, mm(1), { at })
  })
  if (row.kind === 'standoff') {
    // the insert's 4.0 mm hole right through: an M3 × 4 mm heat-set insert
    // goes into each end, and there is no ceiling to bridge
    set = set.hole(marks, j.hole.insert('M3x4', { depth: 'through' }),
      { id: `bore-${row.name}` })
  } else {
    set = set.hole(marks, j.hole.simple(j.fit.hole(mm(row.d), 'slide')),
      { id: `bore-${row.name}` })
  }
})

// Upright, each piece on its end: the bores are vertical and print round.
return j.print('spacer-set', {
  printer: j.printer('generic-fdm'), material: j.material('PETG'),
  parts: [set],
}).orient('+Z').use(j.rules.fdm)
