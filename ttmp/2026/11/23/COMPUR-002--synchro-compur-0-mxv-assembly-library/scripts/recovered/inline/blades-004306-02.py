from pathlib import Path
p=next(Path('import/jigcad/content/presets').glob('M-11*/compur.parts.js'))
s=p.read_text()
a=s.index("  return j.part('Mechanism plate 201')")
s=s[:a]+'''  // The reconstructed carrier post centre lies inside the annular bore.
  // Add the narrow tongue required to support it at the archived pivot.
  plate = plate.union(j.region.slot([13.8152, -1.2358], [17, -1.52], 1.5))
  // The operating ring's downward stop lug sweeps through the top of 201.
  // Keep both posts in that pocket, below ring 202's running surface.
  const pocket = slot(-142.5, -123.8)
'''+s[a:]
a=s.index("    .extrude(j.region.circle(1, { at: [15.8704")
s=s[:a]+'''    .cut(pocket.on(j.plane.offset(j.plane.XY, mm(10.97))),
         mm(0.55), { id: 'stopLugTrack' })
'''+s[a:]
for xy in ['[-14.1136, -11.6875]', '[-10.7535, -14.8376]']:
 s=s.replace(f'0.5, {{ at: {xy} }}).on(j.plane.offset(j.plane.XY, mm(11.5))), mm(1)',f'0.5, {{ at: {xy} }}).on(j.plane.offset(j.plane.XY, mm(10.97))), mm(0.59)')
p.write_text(s)
