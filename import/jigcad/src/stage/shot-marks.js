// Render-only annotations for mechanism studies. Accent masks come from the
// same frontmost face IDs as the drafting sheet; hidden parts receive no tint.
import { applyM } from './math.js';
import { proj } from './camera.js';

export function drawShotAccent(ctx, { scene, buf, k }, accent) {
  if (!accent || !accent.opacity || !buf) return;
  const components = new Set(accent.components);
  const chosen = new Uint8Array(scene.faceCount);
  for (const inst of scene.instances) {
    if (components.has(inst.body.part)) chosen.fill(1, inst.base, inst.base + inst.body.faces.length);
  }
  ctx.save();
  ctx.fillStyle = accent.color;
  ctx.globalAlpha *= accent.opacity;
  // Emit horizontal spans for selected pixels. Frontmost-face classification
  // already excludes assembly neighbors and holes through the selected part.
  for (let y = buf.y0; y <= buf.y1; y++) {
    let start = -1;
    for (let x = buf.x0; x <= buf.x1 + 1; x++) {
      const hit = x <= buf.x1 && chosen[buf.id[y * buf.w + x]];
      if (hit && start < 0) start = x;
      if (!hit && start >= 0) {
        ctx.fillRect(start / k, y / k, (x - start) / k, 1 / k);
        start = -1;
      }
    }
  }
  ctx.restore();
}

// A study is immutable for the lifetime of the render camera. Cache coordinates
// in world space so orbiting and synchronized cameras share the same path.
const trajectories = new WeakMap();
export function trailPoints(study, row, spec) {
  if (!study || !spec) return [];
  let cache = trajectories.get(study);
  if (!cache) { cache = new Map(); trajectories.set(study, cache); }
  const key = JSON.stringify([spec.component, spec.point]);
  let points = cache.get(key);
  if (!points) {
    points = new Map();
    for (const r of study.rows) {
      const transform = study.frameAt(r)?.pose?.[spec.component];
      if (transform) points.set(r, applyM(transform, spec.point));
    }
    cache.set(key, points);
  }
  const start = Math.max(0, Math.ceil(row - spec.seconds * study.last / study.seconds));
  const paths = [];
  let path = null;
  for (let r = start; r <= row; r++) {
    const point = points.get(r);
    if (!point) { path = null; continue; }
    if (!path) { path = []; paths.push(path); }
    path.push(point);
  }
  return paths;
}

export function drawShotTrail(ctx, { cam }, spec, paths) {
  if (!spec || !paths?.length) return;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = spec.color;
  ctx.lineWidth = 1.75;
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  for (const path of paths) {
    const first = proj(cam, path[0]);
    ctx.moveTo(...first);
    for (let i = 1; i < path.length; i++) ctx.lineTo(...proj(cam, path[i]));
  }
  ctx.stroke();
  const tip = proj(cam, paths.at(-1).at(-1));
  ctx.beginPath(); ctx.arc(...tip, 2.75, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
