// build.js — assemble the single-page workbench: the Candela library and app (bundled), the presets, docs and
// reference. node build/build.js [--local]  (--local inlines React and KaTeX for offline testing)
const fs = require('fs'), path = require('path');
const esbuild = (() => { try { return require('esbuild'); } catch (e) { return require('/opt/npm-tools/node_modules/esbuild'); } })();
const ROOT = path.join(__dirname, '..');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const local = process.argv.includes('--local');

function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/); if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split('\n')) { const k = line.match(/^([\w-]+):\s*(.*)$/); if (k) meta[k[1]] = k[2].trim(); }
  return { meta, body: src.slice(m[0].length) };
}
const list = (s, sep = ',') => s ? s.split(sep).map(x => x.trim()).filter(Boolean) : [];
const GROUPS = ['Basics', 'Light', 'Materials', 'Algebra', 'Fields', 'Geometry', 'Media', 'Spectral', 'Camera', 'Engines', 'GPU', 'Live', 'Scenes', 'Machines', 'Diagnostics'];
function loadPresets() {
  const dir = path.join(ROOT, 'content/presets'), out = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const { meta, body } = frontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    const id = meta.id; if (!id) throw new Error(f + ': no id');
    const base = f.replace(/\.md$/, '');
    const files = {};
    const js = path.join(dir, base + '.js'); if (!fs.existsSync(js)) throw new Error(f + ': missing ' + base + '.js');
    files['scene.js'] = fs.readFileSync(js, 'utf8');
    const libDir = path.join(dir, base); if (fs.existsSync(libDir)) for (const g of fs.readdirSync(libDir)) files['lib/' + g] = fs.readFileSync(path.join(libDir, g), 'utf8');
    if (!GROUPS.includes(meta.group)) throw new Error(`${id}: unknown group ${meta.group}`);
    out.push({ id, title: meta.title, group: meta.group, about: meta.about || '', tries: list(meta.tries, '|'), docs: list(meta.docs), focus: list(meta.focus), files, notes: body.trim() + '\n', paused: meta.paused === 'true', time: meta.time != null ? +meta.time : 0 });
  }
  out.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const ids = new Set(); for (const p of out) { if (ids.has(p.id)) throw new Error('duplicate preset id ' + p.id); ids.add(p.id); }
  return out;
}
function checkDocRefs(presets, docs) { const ids = new Set(docs.map(d => d.id)); for (const p of presets) for (const d of p.docs) if (!ids.has(d)) throw new Error(`${p.id}: unknown doc '${d}'`); }
function loadDocs() {
  const dir = path.join(ROOT, 'content/docs'), out = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const { meta, body } = frontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    out.push({ id: meta.id, title: meta.title, group: meta.group, about: meta.about || '', order: +(meta.order || 50), body: body.trim() + '\n' });
  }
  return out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

async function main() {
  const presets = loadPresets(), docs = loadDocs(), reference = rd('content/reference.md');
  checkDocRefs(presets, docs);
  const data = { presets, docs, reference };
  const r = await esbuild.build({
    entryPoints: [path.join(ROOT, 'app/main.jsx')], bundle: true, write: false, format: 'iife', target: 'es2020',
    jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', loader: { '.jsx': 'jsx', '.js': 'jsx' }, minify: !local && process.argv.includes('--min'), legalComments: 'none', charset: 'utf8', logLevel: 'warning',
  });
  const app = r.outputFiles[0].text;
  const css = rd('app/kiln.css') + '\n' + rd('app/skate.css') + '\n' + rd('app/candela.css');
  const safe = s => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  const react = local
    ? `<script>${rd('vendor/react.production.min.js')}</script>\n<script>${rd('vendor/react-dom.production.min.js')}</script>\n<script>${rd('vendor/katex.min.js')}</script>`
    : `<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Candela Workbench</title>
<meta name="description" content="A workbench for physically based rendering: a fluent, typed JavaScript API whose scenes compile to a WebGPU / WebGL2 path tracer, with params as sliders, an IR and shader view, physical diagnostics, and an agent that can see the render.">
<style>
${css}
</style></head><body>
<div id="root"><div id="app"><div class="boot-screen"><p>Loading the workbench…</p></div></div></div>
${react}
<script>
window.CANDELA_DATA = ${safe(JSON.stringify(data))};
</script>
<script>
${safe(app)}
</script>
</body></html>
`;
  const out = path.join(ROOT, local ? 'dist/local.html' : 'dist/index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB · ${presets.length} presets · ${docs.length} docs · app ${(app.length / 1024).toFixed(0)} KB`);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { loadPresets, loadDocs, checkDocRefs, frontmatter, ROOT };
