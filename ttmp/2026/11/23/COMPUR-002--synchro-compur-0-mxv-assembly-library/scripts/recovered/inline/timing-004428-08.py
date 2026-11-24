from pathlib import Path
p=next(Path('content/presets').glob('CP-03*/script.js'))
s=p.read_text().split("  .couple('segment")[0]
p.write_text(s+"""  // Three external meshes. Drive the signed angles analytically so the CAD
  // joint solver need not condition a 1600:1 equation at a tiny input angle.
  .drive('segment', deg(segmentAngle))
  .drive('w1', deg(-15 * segmentAngle))
  .drive('w2', deg(160 * segmentAngle))
  .drive('star', deg(-1600 * segmentAngle))
""")
