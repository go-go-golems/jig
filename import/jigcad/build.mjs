// Build jigcad into dist/: app.js (main thread), worker.js (engine + OpenCascade), index.html, assets.
// Usage: node build.mjs [--watch] [--minify]
// esbuild is not vendored: ESBUILD=/path/to/esbuild/lib/main.js, else the integrator's /opt/npm-tools copy.
const { build, context } = await import(process.env.ESBUILD ?? '/opt/npm-tools/node_modules/esbuild/lib/main.js');
import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const V = p => join(ROOT, 'vendor', p);
const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

// Vendored packages (npm is unreachable here; sources come from their GitHub repos).
const alias = {
  'preact': V('preact/src/index.js'),
  'preact/hooks': V('preact/hooks/src/index.js'),
  'flatbush': V('flatbush/index.js'),
  'flatqueue': V('flatqueue/index.js'),
  'opentype.js': V('opentype/src/opentype.mjs'),
  'replicad': V('replicad/src/index.ts'),
  'replicad-opencascadejs': V('occt/replicad_single.js'),
  'manifold-3d': join(ROOT, 'src/engine/stub-manifold.js'),
};

// Content (presets, book, reference) is bundled as data: content/index.json is generated here.
function collectContent() {
  const out = { presets: [], book: [], docs: {} };
  const pdir = join(ROOT, 'content/presets');
  if (existsSync(pdir)) for (const id of readdirSync(pdir).sort()) {
    const dir = join(pdir, id);
    if (!statSync(dir).isDirectory()) continue;
    const metaPath = join(dir, 'meta.json');
    if (!existsSync(metaPath) || !existsSync(join(dir, 'script.js'))) continue;   // incomplete folders are skipped
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    const files = {};
    for (const f of readdirSync(dir)) if (!['meta.json'].includes(f)) files[f] = readFileSync(join(dir, f), 'utf8');
    out.presets.push({ ...meta, id: meta.id ?? id, files });
  }
  const bdir = join(ROOT, 'content/book');
  if (existsSync(bdir)) for (const f of readdirSync(bdir).sort()) if (f.endsWith('.md'))
    out.book.push({ file: f, text: readFileSync(join(bdir, f), 'utf8') });
  const ddir = join(ROOT, 'content/docs');
  if (existsSync(ddir)) for (const f of readdirSync(ddir).sort()) if (f.endsWith('.md'))
    out.docs[f.replace(/\.md$/, '')] = readFileSync(join(ddir, f), 'utf8');
  mkdirSync(join(ROOT, 'src/generated'), { recursive: true });
  writeFileSync(join(ROOT, 'src/generated/content.json'), JSON.stringify(out));
  return out;
}

const common = {
  bundle: true, format: 'esm', target: 'es2022', sourcemap: false, minify, alias, logLevel: 'warning',
  jsx: 'automatic', jsxImportSource: 'preact',
  loader: { '.md': 'text', '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
};
// preact's automatic runtime lives in preact/jsx-runtime
common.alias['preact/jsx-runtime'] = V('preact/jsx-runtime/src/index.js');

// jig-compute (Rust → wasm32-unknown-unknown): built with cargo when available (JIG_SKIP_CARGO=1 skips the build),
// shipped as dist/jig_compute.wasm next to worker.js. Without it the engine runs its JS implementations.
function buildCompute() {
  const crate = join(ROOT, 'rust/jig-compute');
  const out = join(crate, 'target/wasm32-unknown-unknown/release/jig_compute.wasm');
  if (!process.env.JIG_SKIP_CARGO) {
    try { execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { cwd: crate, stdio: ['ignore', 'ignore', 'inherit'] }); }
    catch (e) { console.warn(`cargo build of jig-compute failed (${e.message.split('\n')[0]}); using the last build if there is one`); }
  }
  if (existsSync(out)) { cpSync(out, join(ROOT, 'dist/jig_compute.wasm')); return statSync(out).size; }
  console.warn('no jig_compute.wasm: dist/ will run the JS implementations');
  return 0;
}

function copyAssets() {
  mkdirSync(join(ROOT, 'dist/occt'), { recursive: true });
  cpSync(V('occt/replicad_single.wasm.gz'), join(ROOT, 'dist/occt/replicad_single.gz.wasm'));   // gzip bytes; the host serves .wasm, not .gz
  mkdirSync(join(ROOT, 'dist/fonts'), { recursive: true });
  const fdir = join(ROOT, 'guides/stage/fonts');
  for (const f of readdirSync(fdir)) if (f.endsWith('.woff2') || f === 'OFL.txt' || f === 'fonts.css') cpSync(join(fdir, f), join(ROOT, 'dist/fonts', f));
  if (existsSync(join(ROOT, 'src/index.html'))) cpSync(join(ROOT, 'src/index.html'), join(ROOT, 'dist/index.html'));
}

async function run() {
  collectContent();
  copyAssets();
  const computeBytes = buildCompute();
  const app = { ...common, entryPoints: [join(ROOT, 'src/main.jsx')], outfile: join(ROOT, 'dist/app.js'), external: ['node:*'] };   // rs/wasm.js reads files only under Node
  const worker = { ...common, entryPoints: [join(ROOT, 'src/engine/worker.js')], outfile: join(ROOT, 'dist/worker.js'),
    platform: 'browser', external: ['fs', 'path', 'module', 'url', 'node:*'] };
  if (watch) {
    for (const cfg of [app, worker]) (await context(cfg)).watch();
    console.log('watching');
  } else {
    await Promise.all([build(app), build(worker)]);
    const size = f => (statSync(join(ROOT, 'dist', f)).size / 1024).toFixed(0) + ' KiB';
    console.log(`dist/app.js ${size('app.js')} · dist/worker.js ${size('worker.js')}${computeBytes ? ` · dist/jig_compute.wasm ${size('jig_compute.wasm')}` : ''}`);
  }
}
run().catch(e => { console.error(e.message); process.exit(1); });
