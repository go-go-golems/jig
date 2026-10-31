import { compile, call } from './base.mjs';
const code = `const sec = j.sketch('sec', { on: j.plane.XZ })
  .line('base', [0, 0], [16, 0])
  .line('wall', [16, 0], [16, 6])
  .line('top', [16, 6], [0, 6])
  .line('axis', [0, 6], [0, 0])
return j.part('disc')
  .revolve(sec.profiles(), j.axis.Z, turn(1), { id: 'd' })`;
const r = await compile(code);
for (const q of ['-Z', '+Z', '<Z', '>Z']) { const f = await call('faces', q); console.log(q, f.ok ? f.value.map(x => x.name + ' ' + JSON.stringify(x.normal)) : f.error.message); }
