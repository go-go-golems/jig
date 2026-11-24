from pathlib import Path
p=next(Path('content/presets').glob('CP-03*/script.js'))
s=p.read_text().split('  // Three external')[0]
p.write_text(s+"""  .drive('segment', deg(segmentAngle))
  .couple('mesh1', 'segment', 'w1', { ratio: -90 / 6 })
  .couple('mesh2', 'w1', 'w2', { ratio: -64 / 6 })
  .couple('mesh3', 'w2', 'star', { ratio: -60 / 6 })
""")
p=next(Path('content/presets').glob('CP-03*/notes.md'))
p.write_text(p.read_text().replace('change the segment drive','change `segmentAngle`'))
