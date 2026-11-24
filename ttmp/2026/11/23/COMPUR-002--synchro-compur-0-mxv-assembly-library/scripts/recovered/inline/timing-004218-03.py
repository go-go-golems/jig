from pathlib import Path
p=next(Path('import/jigcad/content/presets').glob('CP-03*/script.js'))
s=p.read_text().replace('const train =','let train =').replace('  train.add(id, parts[id]())\n  train.joint','  train = train.add(id, parts[id]())\n    .joint')
p.write_text(s)
p=next(Path('import/jigcad/content/presets').glob('CP-07*/script.js'))
p.write_text(p.read_text().replace('const timer =','let timer =').replace('  timer.joint','  timer = timer.joint'))
