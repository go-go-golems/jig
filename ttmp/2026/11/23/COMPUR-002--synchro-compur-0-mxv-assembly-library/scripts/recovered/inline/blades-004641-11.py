from pathlib import Path
p=next(Path('import/jigcad/content/presets').glob('M-11*/compur.parts.js'))
s=p.read_text().replace("  let leaf = j.region.polygon(sector).union(j.region.polygon(arm))","""  // Widen the opposite edge so that the neighbouring leaf covers the
  // perimeter vacated by the trim when the stack returns to closed.
  const side = angle => rotate([13.4, 0], (angle + index * 72) * rad)
  let leaf = j.region.polygon(sector).union(j.region.polygon(arm))
    .union(j.region.polygon([sector[0], side(42), side(50), side(59),
                             side(62)]))
  const path = []
  for (let step = 0; step <= 12; step++) {
    path.push(nextPin(7.7 * rad * step / 12))
  }
  // Remove the small outer offcut as well as the track itself.
  const outside = [[-32, -4], [-32, 24]].map(p => rotate(p, index * 72 * rad))
  leaf = leaf.subtract(j.region.polygon([...path, ...outside]))""")
p.write_text(s)
