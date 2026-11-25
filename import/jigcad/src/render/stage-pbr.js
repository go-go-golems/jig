// The Stage's fixed-camera colour pass. This viewport belongs to one output
// dialog. It never moves the Render tab's camera or starts its playback loop.
import { buildLook, defaultLook, loadCandela, LOOK_FILE } from './host.js';
import { pt, R, S, toCandelaMatrix } from './frame.js';
import { applyM, boxCorners, boxOk, V } from '../stage/math.js';

function sectionBody(original, body) {
  const mesh = body.mesh;
  function triples(input, convert) {
    const out = new Float32Array(input.length);
    for (let i = 0; i < out.length; i += 3) out.set(convert(input.subarray(i, i + 3)), i);
    return out;
  }
  const faces = original.faces.slice();
  faces[body.sectionCapFace] = { id: '@section/cap',
    meta: { kind: 'plane', finish: 'paint', color: '#d47845', roughness: 0.55 } };
  return { ...original, key: null, meshKey: null, faces, positions: triples(mesh.positions, pt),
    normals: triples(mesh.normals, R), indices: mesh.indices, triFace: mesh.triFace };
}

// Place the ray origin ahead of every body even when a long part points
// straight at the camera. Moving it along the view direction leaves the
// projection unchanged. The two axes include orbit roll and plan orientation.
export function sheetView(camera, bodies, pose) {
  const { T, c, r, u, s, H, Y0 } = camera;
  const target = V.add(T, V.mul(u, (Y0 - H / 2) / s));
  let near = 0;
  for (const b of bodies) if (boxOk(b.bbox)) {
    const transform = pose?.[b.part] ?? b.transform;
    for (const corner of boxCorners(b.bbox)) near = Math.max(near, V.dot(V.sub(applyM(transform, corner), target), c));
  }
  return { target: pt(target), at: pt(V.add(target, V.mul(c, near + Math.max(1, H / s)))),
    orthographic: { right: R(r), up: R(u), height: H * S / s } };
}

// A still or movie sent to the native renderer needs this same cut and the
// same appearance metadata as the color layer drawn in the Stage dialog.
export function stagePackage(pkg, bodies) {
  const visible = new Map(bodies.map(b => [b.id, b]));
  const adapted = pkg.bodies.map(original => {
    const body = visible.get(original.id);
    if (!body) return { ...original, hidden: true };
    return body.sectionCapFace != null ? sectionBody(original, body) : original;
  });
  return { ...pkg, bodies: adapted };
}

export async function createStagePBR(host) {
  const initial = host.program?.ok !== false ? host.program : host.lastGood;
  const projectFiles = new Map(host.files);
  const [C, exported] = await Promise.all([loadCandela(), host.export('candela', { quality: 'preview' })]);
  const pkg = JSON.parse(exported.data);
  const vp = new C.Viewport(document.createElement('canvas'));
  vp.motionOverride = null;
  vp.lockEV = true;
  let disposed = false, previousBodies = null, previousStudio, metered = false;
  try { await vp.init(); } catch (err) { vp.backend?.dispose(); throw err; }
  const check = signal => {
    signal?.throwIfAborted();
    if (disposed) throw new DOMException('Render closed', 'AbortError');
  };
  return {
    async render({ camera, geometry = initial, pose, width, height, spp = 4, signal, time = 0, studio = null }) {
      check(signal);
      const bodies = geometry.bodies;
      if (studio !== previousStudio || !previousBodies || previousBodies.length !== bodies.length || bodies.some((b, i) => previousBodies[i] !== b)) {
        const files = studio ? Object.entries(studio.modules) : projectFiles;
        const look = studio?.source ?? projectFiles.get(LOOK_FILE) ?? defaultLook({ ground: false });
        const built = await buildLook(C, files, stagePackage(pkg, bodies), look);
        check(signal);
        if (!built.ok) throw Error(built.error?.message ?? 'Candela could not build this look');
        await vp.load(built.compiled);
        if (studio !== previousStudio) metered = false;
        previousStudio = studio;
        previousBodies = bodies;
      }
      check(signal);
      const poses = {};
      for (const component of pkg.components) {
        const transform = pose?.[component.id];
        poses[component.id] = transform ? toCandelaMatrix(transform) : component.transform;
      }
      vp.externalPoses = poses;
      vp.fixedSize = [width, height];
      vp.setView(sheetView(camera, bodies, pose));
      vp.repack(time);
      while (vp.spp < spp) {
        check(signal);
        if (!vp.frame({ force: true, display: false })) throw Error('The PBR rendering device was lost');
        await vp.backend.idle();
      }
      if (studio?.ev != null) {
        vp.cam.mode = 'fixed';
        vp.cam.ev = studio.ev;
      } else if (!metered && vp.cam.mode === 'auto') {
        await vp.meter();
        metered = true;
      }
      check(signal);
      vp.show();
      return vp.snapshotCanvas();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      vp.backend?.dispose();
    },
  };
}
