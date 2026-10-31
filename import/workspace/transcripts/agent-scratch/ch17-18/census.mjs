import { W, K, oc, surfType } from './base.mjs';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const PR = await import('/home/claude/jigcad/src/engine/program.js');
const root = '/home/claude/jigcad/content/presets';
const out = {};
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const d of readdirSync(root).sort()) {
  if (only && !only.test(d)) continue;
  const dir = `${root}/${d}`;
  const files = {}; for (const f of readdirSync(dir)) files[f] = readFileSync(`${dir}/${f}`, 'utf8');
  const t0 = performance.now();
  try {
    const data = W.parseData(files, 'script.js');
    const model = await W.runScript(files['script.js'], { data });
    if (model?.data && model.P) { out[d] = { skipped: 'design' }; continue; }
    const prog = PR.compile(model, {});
    const bodies = prog.P.parts.flatMap(p => p.res.state.bodies);
    const s = {}, k = {};
    for (const b of bodies) b.faces.list.forEach((f, i) => { const t = surfType(f); s[t] = (s[t] ?? 0) + 1; });
    out[d] = { bodies: bodies.length, surf: s, ms: Math.round(performance.now() - t0) };
  } catch (e) { out[d] = { error: e.message.slice(0, 100), ms: Math.round(performance.now() - t0) }; }
  console.log(d, JSON.stringify(out[d]));
}
writeFileSync('/tmp/ch17-18/census' + (process.argv[2] ? '-part' : '') + '.json', JSON.stringify(out, null, 1));
