// Dump solved sketch data (rounded to 1e-9) for comparing the Rust and JS solver kernels:
//   node test/rs/sketch-dump.mjs > rust.json; JIG_COMPUTE=js node test/rs/sketch-dump.mjs > js.json; diff rust.json js.json
import { init, compilePreset } from './presets.mjs';
await init();
const round = v => typeof v === 'number' ? +v.toFixed(9) : Array.isArray(v) ? v.map(round) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v;
const out = {};
for (const id of ['A-03', 'M-03', 'W-07', 'H-11', 'S-10']) {
  const p = await compilePreset(id);
  out[id] = p.sketches.map(s => round({ id: s.id, dof: s.dof, status: s.status, entities: s.entities, constraints: s.constraints.map(c => ({ id: c.id, status: c.status, value: c.value })), conflicts: s.conflicts }));
}
process.stdout.write(JSON.stringify(out, null, 1));
