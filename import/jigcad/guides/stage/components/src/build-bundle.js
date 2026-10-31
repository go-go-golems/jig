// build-bundle.js — rebuild components/bundle.js (window.FormSkateStage) from the Form Skate workbench's own source.
// usage: node build-bundle.js <repo root> <work dir> <out bundle.js> [<esbuild module path>]
// Nothing is rewritten: app/draft.js, app/truth.js and src/lib/depth-order.js are copied whole; core.js's math
// section and the drawing parts of skate/board.js and skate/figure.js are cut out between fixed markers.
// stage-kit.js (beside this file) adds the stage's own call sequence (app/ui/stage.jsx) as `sheet()`.
const fs = require('fs'), path = require('path');
const [ROOT, WORK, OUT, ESB] = process.argv.slice(2);
const esbuild = require(ESB || 'esbuild');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const cut = (src, from, to, label) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`${label}: marker not found (${a < 0 ? from : to})`);
  return src.slice(a, b);
};
fs.mkdirSync(WORK, { recursive: true });
const w = (f, s) => fs.writeFileSync(path.join(WORK, f), s);

// 1. the vector, quaternion and spring maths of @form/core, as globalThis.FORM (kept if the page already has one)
const core = rd('src/core.js');
const math = cut(core, '// ============================================================ math', '// ============================================================ source locations', 'core.js');
w('form-math.js', `// cut from src/core.js (its math section), unchanged\n(function () {\n${math}\nconst M = { TAU, DEG, clamp, lerp, smooth, ease, wrapPi, near, V, Q, spring };\nglobalThis.FORM = globalThis.FORM || M;\n})();\nexport {};\n`);
w('form-shim.js', 'module.exports = globalThis.FORM;\n');

// 2. the drafting context, the truth raster and the depth-order strategies, whole
for (const [from, to] of [['app/draft.js', 'draft.js'], ['app/truth.js', 'truth.js'], ['src/lib/depth-order.js', 'depth-order.js']]) w(to, rd(from));

// 3. the board's drawing: its dimensions and profile functions, its 18 sections and drawBoard
const board = rd('src/lib/skate/board.js');
w('board-draw.js', `// cut from src/lib/skate/board.js, unchanged\nconst { V, Q, clamp } = require('form');\n`
  + cut(board, '// a 32" street deck', 'function truckAssembly', 'board.js dims')
  + cut(board, '// ---------- drawing:', 'exports.drawBoard', 'board.js drawing')
  + 'module.exports = { DECK, kickY, kickSlope, halfWidth, gripAt, sectionsOfDeck, drawBoard };\n');

// 4. the figure's skeleton, lofted body, posture targets, pose builder and face
const fig = rd('src/lib/skate/figure.js');
w('figure-body.js', `// cut from src/lib/skate/figure.js, unchanged\nconst { V, Q, clamp, lerp, spring } = require('form');\n`
  + cut(fig, '// ---------- skeleton', 'exports.figure =', 'figure.js body')
  + cut(fig, 'function buildPose', 'exports.SKELETON', 'figure.js pose')
  + 'module.exports = { HJOINTS, J, PARTS, STICK, CH, HALF, fk, toW, newPose, legIK, armIK, limitJoint, postureFor, buildPose, drawFace };\n');

// 5. the kit and the entry
fs.copyFileSync(path.join(__dirname, 'stage-kit.js'), path.join(WORK, 'stage-kit.js'));
const COMPONENTS = ['Views', 'Loft', 'Figure', 'GroundAndShadow', 'Hatching', 'DepthOrder', 'Overlays', 'Trail', 'Chronophotograph', 'DimensionLine', 'Labels', 'SheetFurniture', 'Chip', 'TrickToast', 'FailBanner', 'StageHint', 'OverlayMenu'];
(async () => {
  const r = await esbuild.build({
    entryPoints: [path.join(WORK, 'stage-kit.js')], bundle: true, write: false, format: 'iife', target: 'es2020', charset: 'utf8', legalComments: 'none',
    alias: { form: path.join(WORK, 'form-shim.js') },
  });
  let js = r.outputFiles[0].text;
  if (/<\/script|<!--/i.test(js)) js = js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  const head = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: 'FormSkateStage', components: COMPONENTS.map(name => ({ name })) })} */\n`;
  fs.writeFileSync(OUT, head + js);
  console.log(`wrote ${OUT}: ${(head.length + js.length) / 1024 | 0} KB`);
})().catch(e => { console.error(e); process.exit(1); });
