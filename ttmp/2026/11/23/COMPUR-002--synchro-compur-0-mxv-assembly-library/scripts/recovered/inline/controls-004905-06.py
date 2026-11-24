from pathlib import Path
p=next(Path('import/jigcad/content/presets').glob('M-11*/look.js'))
s=p.read_text().replace("  // materials: the Render view adds lines here","""  // Give the rounded ends of the thin sheet slots the same through-thickness
  // grain direction as their straight walls. Each retains its black oxide
  // and ground roughness, with one tangent field shared across the sheets.
  .meta(f => /^blade(?:[1-5]|Plate)$/.test(f.component)
    && f.id.includes('/side[slot.') && f.meta.kind === 'cylinder',
    { direction: [0, 1, 0] })
  // materials: the Render view adds lines here""")
p.write_text(s)
