// Snapshot of the drafting camera used by the export dialog. The geometry,
// frame, and projection of each view are shared by the technical and PBR passes.
import { draw } from './sheet.js';
import { viewCam } from './camera.js';
import { applyM, boxCorners, boxOk, emptyBox, growBox } from './math.js';
import { studyAssembly } from './study-preview.js';
import { trailPoints } from './shot-marks.js';
import { shotGeometry } from './section.js';

export function outputCamera({ source, still, stillFrame, stillPose, baseView, cam, baseHeight,
  element, settings, study, fitBox }) {
  const bounds = fitBox.map(p => [...p]);
  if (study) {
    const bodies = source.bodies.filter(b => boxOk(b.bbox))
      .map(b => ({ body: b, corners: boxCorners(b.bbox) }));
    for (const row of study.rows) {
      const { pose } = study.frameAt(row);
      for (const { body, corners } of bodies) {
        const matrix = pose[body.part] ?? body.transform;
        for (const corner of corners) growBox(bounds, applyM(matrix, corner));
      }
    }
  }
  const auxiliaryCanvases = new WeakMap();
  return (canvas, { width, height, fit, zoom, row, style, layout, fraction = 0 }, beautyRenderer) => {
    const frame = row == null ? stillFrame : study.frameAt(row);
    const model = row == null ? still : { ...source, assembly: studyAssembly(source.assembly, frame) };
    const camera = { ...baseView, sketchFit: fit ? null : baseView.sketchFit,
      pan: cam.sketch && !fit ? baseView.pan : [0, 0],
      scale: fit ? null : cam.s * height / baseHeight * zoom,
      target: fit ? null : cam.T, zoom };
    const geometry = style ? shotGeometry(model, style) : model;
    const pose = frame?.pose ?? stillPose;
    const shotView = layout ?? style?.view ?? 'stage';
    const shotTrail = style?.trail && study && trailPoints(study, row ?? study.currentRow(), style.trail);
    const paintView = (target, w, h, view, box, secondary = false) => {
      const opts = { ...settings, width: w, height: h, fitBox: box, pose, style, shotTrail,
        furniture: !secondary, componentNameOpacity: secondary ? 0 : frame?.componentNameOpacity };
      if (style?.isolate && typeof settings.selection?.body === 'number') {
        const id = model.bodies[settings.selection.body]?.id;
        const index = geometry.bodies.findIndex(b => b.id === id);
        opts.selection = index < 0 ? null : { ...settings.selection, body: index };
      }
      if (secondary) opts.overlays = new Set();
      const drawSheet = beauty => draw(target, geometry, view, { ...opts, beauty });
      if (!style?.surface) return drawSheet(null);
      const projection = viewCam(view, box, w, h);
      return beautyRenderer({ camera: projection, pose, geometry, width: w, height: h }).then(drawSheet);
    };
    let auxiliary;
    if (shotView === 'front-side' || shotView?.inset) {
      auxiliary = auxiliaryCanvases.get(canvas);
      if (!auxiliary) {
        auxiliary = element.ownerDocument.createElement('canvas');
        auxiliaryCanvases.set(canvas, auxiliary);
      }
    }
    const caption = (ctx, title, x, y) => {
      ctx.save();
      ctx.font = '12px sans-serif';
      const palette = getComputedStyle(element);
      ctx.fillStyle = palette.getPropertyValue('--panel');
      ctx.fillRect(x, y, ctx.measureText(title).width + 10, 18);
      ctx.fillStyle = palette.getPropertyValue('--ink');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, x + 5, y + 3);
      ctx.restore();
    };
    if (shotView === 'front-side') {
      const left = Math.floor(width / 2), right = width - left;
      const sideView = name => ({ ...camera, name, yaw: 0, pitch: 0 });
      return (async () => {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        await paintView(auxiliary, left, height, sideView('front'), bounds, true);
        ctx.drawImage(auxiliary, 0, 0);
        await paintView(auxiliary, right, height, sideView('side'), bounds, true);
        ctx.drawImage(auxiliary, left, 0);
        ctx.fillStyle = getComputedStyle(element).getPropertyValue('--hair');
        ctx.fillRect(left, 0, 1, height);
        caption(ctx, 'Front', 4, 4);
        caption(ctx, 'Side', left + 4, 4);
      })();
    }
    if (shotView === 'turntable') camera.yaw += fraction * 2 * Math.PI;
    const main = paintView(canvas, width, height, camera, bounds);
    if (!shotView?.inset) return main;
    return (async () => {
      await main;
      const insetBounds = emptyBox();
      for (const b of geometry.bodies) {
        if (b.part !== shotView.inset || !boxOk(b.bbox)) continue;
        for (const p of boxCorners(b.bbox)) growBox(insetBounds, applyM(pose?.[b.part] ?? b.transform, p));
      }
      if (!boxOk(insetBounds)) return;
      const w = Math.max(1, Math.round(width * 0.36)), h = Math.max(1, Math.round(height * 0.38));
      const detail = { ...camera, target: null, scale: null, zoom: 1.3, pan: [0, 0] };
      await paintView(auxiliary, w, h, detail, insetBounds, true);
      const ctx = canvas.getContext('2d');
      const x = width - w - 6;
      ctx.drawImage(auxiliary, x, 6);
      ctx.strokeStyle = getComputedStyle(element).getPropertyValue('--ink');
      ctx.strokeRect(x + 0.5, 6.5, w - 1, h - 1);
      caption(ctx, shotView.inset, x + 1, 7);
    })();
  };
}
