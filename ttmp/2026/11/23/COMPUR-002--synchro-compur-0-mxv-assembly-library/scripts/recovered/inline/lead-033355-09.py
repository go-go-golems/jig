from pathlib import Path
s=next(Path('ttmp/2026/11/23').glob('COMPUR*/scripts/check-blade-aperture.mjs')).read_text().replace("import { readFileSync }", "import { readFileSync, writeFileSync }")
s=s.replace('  let samples =', '''  const leaves = program.bodies.filter(b => /^blade[1-5]\\//.test(b.id)).map(b => topTriangles([b]))
  writeFileSync('/tmp/compur-report-figs/triangles-' + angle + '.json', JSON.stringify(leaves))
  let samples =''')
Path('/tmp/compur-report-figs/mesh.mjs').write_text(s)
