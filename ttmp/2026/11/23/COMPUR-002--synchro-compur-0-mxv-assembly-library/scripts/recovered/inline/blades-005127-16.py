from pathlib import Path
p=next(Path('ttmp/2026/11/23').glob('COMPUR-002*/scripts/check-blade-aperture.mjs'))
s=p.read_text().replace('  let samples = 0, covered = 0','  const outerRadius = Math.max(...triangles.flat().map(([x, y]) => Math.hypot(x, y)))\n  assert.ok(outerRadius <= 27.45, \'blade leaves exceed their chamber radius\')\n  let samples = 0, covered = 0').replace(" + ' rays blocked')", " + ' rays blocked; outer radius ' + outerRadius.toFixed(3) + ' mm')")
p.write_text(s)
