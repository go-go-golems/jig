from pathlib import Path
p=next(Path('content/presets').glob('CP-03*/script.js'))
s=p.read_text().replace("const train", "let train")
s=s.replace("let train = j.assembly", """const datum = j.frame({
  origin: j.pt(0, 0, 0), x: j.dir('+X'), z: j.dir('+Z'),
})
let train = j.assembly""").replace("parts.base(), { ground: true }", "parts.base().port('seat', datum), { ground: true }").replace(".add('escPlates', parts.escPlates(), { at: j.tx.move(0, 0, 0) })",".add('escPlates', parts.escPlates().port('seat', datum))\n  .joint('seat', j.joint.rigid(), 'base:seat', 'escPlates:seat')")
p.write_text(s)
