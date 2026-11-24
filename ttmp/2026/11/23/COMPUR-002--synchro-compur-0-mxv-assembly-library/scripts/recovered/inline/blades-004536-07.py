from pathlib import Path
p=next(Path('import/jigcad/content/presets').glob('M-11*/compur.parts.js'))
s=p.read_text()
a=s.index('const blade1 =')
s=s[:a]+'''// At mid-stroke a neighbouring drive pin crosses the sector edge of
// the archive's idealized leaf. Trim the swept pin envelope in leaf
// coordinates. The extra 0.08 mm radial clearance is a design allowance.
function relievedLeaf(sector, arm, pivot, index) {
  const rad = Math.PI / 180
  const rotate = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a),
                                  x * Math.sin(a) + y * Math.cos(a)]
  const pin = rotate([14.0835, 11.528], index * 72 * rad)
  const heading = ([x, y]) => Math.atan2(y - pivot[1], x - pivot[0])
  function nextPin(stroke) {
    const swing = heading(rotate(pin, stroke)) - heading(pin)
    const [x, y] = rotate(pin, stroke + 72 * rad)
    const [dx, dy] = rotate([x - pivot[0], y - pivot[1]], -swing)
    return [pivot[0] + dx, pivot[1] + dy]
  }
  let leaf = j.region.polygon(sector).union(j.region.polygon(arm))
  for (let step = 0; step < 12; step++) {
    const start = nextPin(7.7 * rad * step / 12)
    const end = nextPin(7.7 * rad * (step + 1) / 12)
    leaf = leaf.subtract(j.region.slot(start, end, 1.06))
  }
  return leaf
}
'''+s[a:]
for i in range(5):
 a=s.index('const blade'+str(i+1)+' =')
 b=s.index('})()\n  .port',a)
 s=s[:a]+s[a:b].replace('j.region.polygon(sector).union(j.region.polygon(arm)).subtract(j.region.circle(P.hole',f'relievedLeaf(sector, arm, P.pivot, {i}).subtract(j.region.circle(P.hole')+s[b:]
p.write_text(s)
