import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
const ROOT = (process.argv[2] || new URL('../../../../../../import/jigcad', import.meta.url).pathname);
const { startChromeLook } = await import(ROOT + '/tools/agent-eval/chrome-look.mjs');
const look = await startChromeLook({ base: 'http://127.0.0.1:8788/' });
try {
  const dir = ROOT + '/content/presets/A-01-box';
  const files = Object.fromEntries(readdirSync(dir).filter(f => f !== 'meta.json').map(f => [f, readFileSync(dir + '/' + f, 'utf8')]));
  const sh = "{ direction: 'in', id: 'shell' })";
  for (const [name, depth] of [['neg', 'mm(-0.6)'], ['pos', 'mm(0.6)']]) {
    const s = files['script.js'].replace(sh, sh + `\n  .emboss(j.region.text('JIG', { size: 10, align: 'center' }), ${depth}, { on: j.feat('body').sideFace('base.outline.bottom'), id: 'engrave' })`);
    const shot = await look.render({ presetId: 'A-01', files: { ...files, 'script.js': s }, overrides: {}, view: 'front', width: 640, height: 480 });
    writeFileSync(`${process.argv[3]}/v02-${name}.jpg`, Buffer.from(shot.data, 'base64'));
  }
} finally { look.close(); }
