// A portable Spark job contains the same display-only geometry, plates and camera
// samples used by the dialog. It does not require opening the source preset remotely.
import { defaultLook, loadCandela, sceneFiles } from './host.js';
import { toCandelaMatrix } from './frame.js';
import { sheetView, stagePackage } from './stage-pbr.js';
import { projectStudio } from './studios.js';
import { isWorkArea, outputFrames, outputRow, STAGE_FPS } from './work-area.js';

function arrayBytes(_key, value) {
  if (!ArrayBuffer.isView(value)) return value;
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let raw = '';
  for (let i = 0; i < bytes.length; i += 16384) raw += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(raw);
}

function solid(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
  return canvas;
}

async function pngBytes(canvas) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Error('Could not encode a Stage plate.');
  return new Uint8Array(await blob.arrayBuffer());
}

export async function nativeStageJob({ host, job, settingsAt, first, last, studio, spp, signal, onProgress }) {
  const { study } = job, count = study ? outputFrames(study) : 1;
  if (!isWorkArea(first, last, count)) throw Error('Invalid native render interval.');
  studio ??= projectStudio(host.files, defaultLook({ ground: false }));
  const C = await loadCandela();
  const entries = [], text = new TextEncoder(), frames = [], scenes = new Map(), bodyIDs = new WeakMap();
  let nextBody = 0, pkg;
  const black = solid('black'), white = solid('white'), target = document.createElement('canvas');
  const addText = (name, contents) => entries.push({name, data: text.encode(contents)});
  const { width, height } = settingsAt(study ? outputRow(study, first) : null);
  for (let sourceFrame = first; sourceFrame <= last; sourceFrame++) {
    signal.throwIfAborted();
    const sample = study ? outputRow(study, sourceFrame) : null;
    const settings = settingsAt(sample), views = [];
    await job.draw(target, settings, async ({ camera, geometry, pose, width, height, origin }) => {
      signal.throwIfAborted();
      if (!pkg) pkg = JSON.parse((await host.export('candela', { quality: 'preview' })).data);
      const key = geometry.bodies.map(body => {
        if (!bodyIDs.has(body)) bodyIDs.set(body, nextBody++);
        return bodyIDs.get(body);
      }).join(',');
      if (!scenes.has(key)) {
        const dir = 'scene-' + scenes.size;
        scenes.set(key, dir);
        const packed = JSON.stringify(stagePackage(pkg, geometry.bodies), arrayBytes);
        const files = sceneFiles(Object.entries(studio.modules), studio.source, 'export const program = ' + packed + ';');
        for (const [name, source] of Object.entries(files)) addText(dir + '/' + name, source);
      }
      const poses = Object.fromEntries(pkg.components.map(c => [c.id, pose?.[c.id] ? toCandelaMatrix(pose[c.id]) : c.transform]));
      views.push({ scene: scenes.get(key), width, height, origin, view: sheetView(camera, geometry.bodies, pose), poses });
      return black;
    });
    const plate = 'plates/' + sourceFrame;
    entries.push({name: plate + '-black.png', data: await pngBytes(target)});
    for (let v = 0; v < views.length; v++) {
      signal.throwIfAborted();
      let index = 0;
      await job.draw(target, settings, async () => index++ === v ? white : black);
      entries.push({name: plate + '-' + v + '.png', data: await pngBytes(target)});
    }
    frames.push({ sourceFrame, sample, time: study ? settings.fraction * study.seconds : 0, views });
    onProgress(Math.round(100 * frames.length / (last - first + 1)));
    if (sourceFrame % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  addText('job.json', JSON.stringify({ format: 'jig-stage-job/1', fps: STAGE_FPS, width, height,
    first, last, spp, ev: studio.ev, frames }));
  addText('README.txt', 'Run with scripts/render-stage-job.py from the Jig checkout on an OptiX machine.\nExample: python3 scripts/render-stage-job.py JOB.zip OUTPUT --rt /path/to/candela-rt --bundle /path/to/candela-core.js --kernels import/candela/native/rt/kernels\n');
  signal.throwIfAborted();
  return C.zipStore(entries);
}
