from pathlib import Path
p=Path('import/jigcad/src/engine/worker.js')
p.write_text(p.read_text().replace("at: info.file ?? 'script.js', message:", "at: info.file ?? 'script.js', file: info.file ?? 'script.js', message:"))
