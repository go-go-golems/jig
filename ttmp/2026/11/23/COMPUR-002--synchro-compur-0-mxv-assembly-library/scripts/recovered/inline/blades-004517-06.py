from pathlib import Path
p=next(Path('import/jigcad/content/presets').glob('M-11*/compur.parts.js'))
s=p.read_text()
a=s.index("  const body = j.region.circle(P.od",s.index('const ring ='))
b=s.index("  return j.part('Blade operating ring",a)
s=s[:a]+s[a:b].replace('const body =','let body =')+'''  // Clear fixed posts E and the arrest stop over the 7.7-degree ring stroke.
  // In ring coordinates the two stationary posts sweep clockwise.
  for (const [x, y, diameter] of [[19.3306, 8.2054, 1.36],
                                  [17.2595, 13.2213, 1.16]]) {
    const end = -7.7 * Math.PI / 180
    const at = a => [x * Math.cos(a) - y * Math.sin(a),
                     x * Math.sin(a) + y * Math.cos(a)]
    for (let i = 0; i < 3; i++) {
      body = body.subtract(j.region.slot(at(end * i / 3),
                                         at(end * (i + 1) / 3), diameter))
    }
  }
'''+s[b:]
p.write_text(s)
