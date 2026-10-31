// Engraved text: a 90 × 30 × 4 mm tag with 6 mm and 3 mm text cut 0.6 mm deep (small glyphs, counters, many edges).
return j.part('tag')
  .extrude(j.sketch('p', { on: j.plane.XY }).rect('r', 90, 30, { center: true, r: 4 }).profiles(), mm(4), { id: 'body' })
  .emboss(j.region.text('PETG 0.4 · 42', { size: 6, align: 'center', valign: 'middle', at: [0, 3] })
    .union(j.region.text('M3 x 12 · 2026-10-31', { size: 3, font: 'mono', align: 'center', valign: 'middle', at: [0, -8] })),
    mm(0.6), { on: j.feat('body').endFace(), op: 'cut', id: 'engraved' })
