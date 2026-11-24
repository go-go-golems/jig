from pathlib import Path
p=next(Path('import/jigcad/content/presets').glob('M-11*/compur.parts.js'))
s=p.read_text().replace('  return leaf\n}', '''  // Keep the full-open pupil clear. Transform its circular boundary
  // back into the rigid leaf's closed-pose coordinates before cutting.
  const [dx, dy] = rotate([-pivot[0], -pivot[1]], 36.7098 * rad)
  return leaf.subtract(j.region.circle(12.9, {
    at: [pivot[0] + dx, pivot[1] + dy]
  }))
}''')
p.write_text(s)
