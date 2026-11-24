from pathlib import Path
p=next(Path('content/presets').glob('CP-03*/script.js'))
s=p.read_text().replace("const parts =", "const segmentAngle = 0 // degrees of sector travel from the reference pose\nconst parts =").replace(".drive('segment', deg(0))","""  // Seed the high-ratio train at its analytic solution.
  .hint('segment', deg(segmentAngle))
  .hint('w1', deg(-15 * segmentAngle))
  .hint('w2', deg(160 * segmentAngle))
  .hint('star', deg(-1600 * segmentAngle))
  .drive('segment', deg(segmentAngle))""".lstrip())
p.write_text(s)
