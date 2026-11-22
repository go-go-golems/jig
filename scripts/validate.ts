// scripts/validate.ts [IDs…] — build every preset in Node (no GPU): diagnostics, stats, WGSL→GLSL translation.
// The port of the original test/validate.js; exits non-zero when any preset fails to build or translate.
import { build, formatDiag } from '../src/engine/candela';
import { wgslToGlsl } from '../src/engine/wgsl2glsl';
import { loadCatalogFromDisk } from '../src/content/node';

const only = process.argv.slice(2);
const all = loadCatalogFromDisk().presets;
const ps = all.filter(p => !only.length || only.includes(p.id));
let bad = 0;
for (const p of ps) {
  const r = await build(p.files);
  const errs = r.diags.filter(d => d.severity === 'error'), warns = r.diags.filter(d => d.severity === 'warning');
  let glsl = 'ok';
  if (r.ok) { try { wgslToGlsl(r.compiled.shared); } catch (e) { glsl = 'GLSL FAIL ' + (e as Error).message; } }
  const s = r.ok ? r.compiled.stats : null;
  console.log(`${r.ok && glsl === 'ok' ? 'ok ' : 'ERR'} ${p.id.padEnd(6)} ${p.title.slice(0, 38).padEnd(38)} ${s ? `${String(s.objects).padStart(4)} obj ${String(s.materials).padStart(3)} mat ${String(s.params).padStart(2)} par ${s.lines} ln` : ''} ${warns.length ? warns.map(w => w.code).join(',') : ''}`);
  for (const d of errs.concat(warns.filter(() => only.length > 0))) console.log('      ', formatDiag(d).split('\n').join('\n       '));
  if (glsl !== 'ok') console.log('      ', glsl);
  if (!r.ok || glsl !== 'ok') bad++;
}
console.log(`${ps.length - bad}/${ps.length} build`);
process.exit(bad ? 1 : 0);
