from pathlib import Path
p=Path('import/jigcad/src/engine/worker.js')
s=p.read_text()
l=next(l for l in s.splitlines() if 'new RegExp(' in l and 'file.replace' in l)
s=s.replace(l,r"""  const label = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${label}:(\\d+):(\\d+)`);""")
p.write_text(s)
