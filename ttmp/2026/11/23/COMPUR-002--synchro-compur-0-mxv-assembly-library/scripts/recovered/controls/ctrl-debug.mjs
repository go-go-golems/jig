// The Compur example (JIG-016 §6.6, outside engines): preset M-11, the Synchro-Compur 0-MXV leaf shutter, rendered
// by Candela and moved by poses from the shutter's own planar dynamics, not by a jig study. tools/compur-poses.mjs
// ran one 1/125 release of the Compur project's simulation and baked it into the preset's compur-poses.look.js; the
// preset's look.js imports it as the scene's animation. Here: the preset compiles and exports, the look builds in
// Candela with the files the Render view sends (render/host.js build()), and the poses are the simulation's planar
// motion lifted about jig's Z through each part's jig joint, in the package's frame, composed with the placement.
//   node --test test/render/compur.test.mjs        (the cold compile of 29 parts takes about 20 s)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
register('file:///home/manuel/code/wesen/go-go-golems/jig/import/jigcad/test/engine/loader.mjs');

const ROOT = '/home/manuel/code/wesen/go-go-golems/jig/import/jigcad';
const DIR = join(ROOT, 'content/presets/M-11-synchro-compur');
const W = await import('file:///home/manuel/code/wesen/go-go-golems/jig/import/jigcad/src/engine/worker.js');
const { toCandelaMatrix } = await import('file:///home/manuel/code/wesen/go-go-golems/jig/import/jigcad/src/engine/cadpkg.js');
const C = await import('file:///home/manuel/code/wesen/go-go-golems/jig/import/jigcad/dist/candela.js');
const BAKED = await import(pathToFileURL(join(DIR, 'compur-poses.look.js')).href);
const BRIDGE = readFileSync(join(ROOT, 'src/render/jig-candela.js'), 'utf8');
const PRESET = Object.fromEntries(readdirSync(DIR).filter((f) => f !== 'meta.json').map((f) => [f, readFileSync(join(DIR, f), 'utf8')]));
const LOOK_MARK = '// materials: the Render view adds lines here';   // render/host.js
const isLookFile = (path) => path === 'look.js' || /\.look\.js$/.test(path);

const MOVING = ['ring', 'blade1', 'blade2', 'blade3', 'blade4', 'blade5', 'cam', 'retard', 'segment', 'weight', 'w1', 'w2', 'star',
  'carrier', 'latch', 'release', 'pallet'];
const STATIC = ['housing', 'tube', 'base', 'bladePlate', 'bridge', 'escPlates', 'speedCam', 'speedRing', 'cover', 'iris', 'pinion', 'cockingRing'];
const D = BAKED.default, deg = Math.PI / 180;
const maxDiff = (a, b) => Math.max(...Array.from(a, (v, i) => Math.abs(v - b[i])));
const mul = (a, b) => Array.from({ length: 16 }, (_, k) => { const j = k >> 2, i = k & 3; return a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3]; });
/** jig's frame: a turn th about the axis through (cx, cy) parallel to Z, then a move (dx, dy), mm, column-major */
const planar = (c, th, dx = 0, dy = 0) => { const co = Math.cos(th), s = Math.sin(th);
  return [co, s, 0, 0, -s, co, 0, 0, 0, 0, 1, 0, c[0] + dx - (co * c[0] - s * c[1]), c[1] + dy - (s * c[0] + co * c[1]), 0, 1]; };
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let program, pkg, compileMs;
await (async () => {
  await W.handle({ id: 0, op: 'init' });
  const t0 = performance.now();
  // the workbench sends every file of the project; script.js runs, the rest is data (the look files are text)
  const r = await W.handle({ id: 1, op: 'compile', files: PRESET, entry: 'script.js', options: {} });
  compileMs = performance.now() - t0;
  assert.ok(r.ok, r.error?.message);
  program = r.program;
  const e = await W.handle({ id: 2, op: 'export', format: 'candela', options: { quality: 'render' } });
  assert.ok(e.ok, e.error?.message);
  pkg = JSON.parse(e.data);
})();

// the Render view's build (render/host.js RenderHost.build): the bridge, the package, the look as scene.js and every
// other project file named *.look.js under its own name
function lookFiles(look = PRESET['look.js']) {
  const files = { 'jig-candela.js': BRIDGE, 'jig-program.js': 'export const program = __jigPackage;', 'scene.js': look };
  for (const [k, v] of Object.entries(PRESET)) if (k !== 'look.js' && isLookFile(k)) files[k] = v;
  return files;
}
const buildLook = (look) => C.build(lookFiles(look), { scope: { __jigPackage: pkg } });


; const fs=await import('node:fs'); fs.writeFileSync('/tmp/ctrl-meta.json',JSON.stringify(pkg.bodies.map(b=>({c:b.component,faces:b.faces})))); const r=await buildLook(); console.log('materials',r.compiled.materials.length,'shared',r.compiled.shared.length);