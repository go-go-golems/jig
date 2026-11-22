// node test/validate.js [id…] — build every preset in Node (no GPU): diagnostics, stats, WGSL→GLSL translation
const path = require('path'), fs = require('fs');
const esbuild = (() => { try { return require('esbuild'); } catch (e) { return require('/opt/npm-tools/node_modules/esbuild'); } })();
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'node-entry.js')], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(__dirname, '.candela.node.cjs'), logLevel: 'error' });
const C = require('./.candela.node.cjs');
const { loadPresets } = require('../build/build.js');
(async () => {
  const only = process.argv.slice(2);
  const all = loadPresets(); require('../build/build.js').checkDocRefs(all, require('../build/build.js').loadDocs());
  const ps = all.filter(p => !only.length || only.includes(p.id));
  let bad = 0;
  for (const p of ps) {
    const r = await C.build(p.files);
    const errs = r.diags.filter(d => d.severity === 'error'), warns = r.diags.filter(d => d.severity === 'warning');
    let glsl = 'ok';
    if (r.ok) { try { C.wgslToGlsl(r.compiled.shared); } catch (e) { glsl = 'GLSL FAIL ' + e.message; } }
    const s = r.ok ? r.compiled.stats : null;
    console.log(`${r.ok && glsl === 'ok' ? 'ok ' : 'ERR'} ${p.id.padEnd(6)} ${p.title.slice(0, 38).padEnd(38)} ${s ? `${String(s.objects).padStart(4)} obj ${String(s.materials).padStart(3)} mat ${String(s.params).padStart(2)} par ${s.lines} ln` : ''} ${warns.length ? warns.map(w => w.code).join(',') : ''}`);
    for (const d of errs.concat(warns.filter(w => only.length))) console.log('      ', C.formatDiag(d).split('\n').join('\n       '));
    if (glsl !== 'ok') console.log('      ', glsl);
    if (!r.ok || glsl !== 'ok') bad++;
  }
  console.log(`${ps.length - bad}/${ps.length} build`);
})();
