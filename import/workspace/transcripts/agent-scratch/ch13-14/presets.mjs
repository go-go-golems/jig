import { compile } from './lib.mjs';
import { readFileSync, readdirSync } from 'node:fs';
const dir = '/home/claude/jigcad/content/presets';
for (const d of readdirSync(dir).sort()) {
  let code; try { code = readFileSync(`${dir}/${d}/script.js`, 'utf8'); } catch { continue; }

  const t0 = performance.now();
  const r = await compile(code);
  const p = r.program;
  const dec = (p?.decisions || []).filter(x => x.kind === 'solver');
  for (const x of dec) console.log(d, x.at, x.chose, x.reason);
  for (const s of p?.sketches || []) if (s.n) console.log('   ', d, s.id, 'n', s.n, 'rank', s.rank, 'dof', s.dof, s.status);
}
