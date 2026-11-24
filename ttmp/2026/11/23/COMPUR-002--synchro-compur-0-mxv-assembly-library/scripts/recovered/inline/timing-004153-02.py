from pathlib import Path
p=Path('delay.parts.js')
s=p.read_text().replace('.88, .35),','.88, .35).port(\'axis\', frame(first)),').replace('.19)), 1.12, .16),','.19)), 1.12, .16).port(\'axis\', frame(first)),')
p.write_text(s)
p=Path('script.js')
s=p.read_text().replace(".add('ratchet', p.ratchet(), { at: j.tx.move(0, 0, 0) })",".add('ratchet', p.ratchet())").replace(".add('clutch', p.clutch(), { at: j.tx.move(0, 0, 0) })",".add('clutch', p.clutch())").replace('return timer',"""return timer
  .joint('clutchFace', j.joint.rigid(), 'input:axis', 'ratchet:axis')
  .joint('clutchHook', j.joint.rigid(), 'setting:axis', 'clutch:axis')""")
p.write_text(s)
