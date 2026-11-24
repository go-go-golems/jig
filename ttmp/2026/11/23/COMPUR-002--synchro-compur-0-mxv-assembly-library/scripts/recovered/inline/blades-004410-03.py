from pathlib import Path
p=Path('import/jigcad/content/presets/CP-08-diaphragm/diaphragm.parts.js')
s=p.read_text().replace('''    const angle = i * 72 + 18
    ring = ring.subtract(j.region.slot(polar(22.8, angle - 4),
                                       polar(25.2, angle + 4), 0.78))''','''    const [x, y] = guide(i)
    const [dx, dy] = polar(2.1, i * 72 + 74)
    ring = ring.subtract(j.region.slot([x - dx, y - dy],
                                       [x + dx, y + dy], 0.78))''')
p.write_text(s)
