// Exports (README §4.14): STL (binary), STEP (OpenCascade writer through the Emscripten FS), 3MF (own store-only
// ZIP with CRC-32), SVG of a view, and the IR bundle. Every export returns a lowering report.
import { getOC } from './oc.js';
import * as K from './kernel.js';
import { meshBody } from './mesh.js';

const V = K.V;

// ── ZIP (store only) ─────────────────────────────────────────────────────────
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const enc = new TextEncoder();
export function zip(files) {   // files: [{ name, data: Uint8Array | string }]
  const parts = [], central = [];
  let offset = 0;
  const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
// Minimal reader for tests: [{ name, data }] (store-only entries)
export function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = []; let p = 0;
  while (p + 30 <= bytes.length && dv.getUint32(p, true) === 0x04034b50) {
    const size = dv.getUint32(p + 18, true), nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true), crc = dv.getUint32(p + 14, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nlen));
    const data = bytes.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    out.push({ name, data, crcOk: crc32(data) === crc });
    p += 30 + nlen + xlen + size;
  }
  return out;
}

// ── meshes in world (or plate) coordinates ──────────────────────────────────
function worldMeshes(prog, { plate = null, chord } = {}) {
  const out = [];
  const plates = prog.data.print?.plates;
  for (const { part, body, transform } of prog.kernelBodies()) {
    const id = `${part}/${body.id}`;
    let T = transform;
    if (plates) { const pl = plates.find(p => plate == null ? true : p.index === plate); const it = pl?.items.find(i => i.body === id); if (it) T = it.transform; else if (plate != null) continue; }
    const m = meshBody(body, chord ? { deflection: chord } : {});
    out.push({ id, part, mesh: m, T });
  }
  return out;
}
const tri = (m, T, t) => [0, 1, 2].map(k => { const i = m.indices[3 * t + k] * 3; return K.matApply(T, [m.positions[i], m.positions[i + 1], m.positions[i + 2]]); });

export function stl(prog, opts = {}) {
  const meshes = worldMeshes(prog, opts);
  const n = meshes.reduce((s, x) => s + x.mesh.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + 50 * n); const dv = new DataView(buf);
  const head = enc.encode(`jigcad STL ${prog.data.name} (mm)`.slice(0, 79)); new Uint8Array(buf).set(head, 0);
  dv.setUint32(80, n, true);
  let p = 84;
  for (const { mesh, T } of meshes) for (let t = 0; t < mesh.indices.length / 3; t++) {
    const [a, b, c] = tri(mesh, T, t);
    const nn = V.unit(V.cross(V.sub(b, a), V.sub(c, a)));
    for (const v of [nn, a, b, c]) { dv.setFloat32(p, v[0], true); dv.setFloat32(p + 4, v[1], true); dv.setFloat32(p + 8, v[2], true); p += 12; }
    dv.setUint16(p, 0, true); p += 2;
  }
  const dev = Math.max(...meshes.map(m => m.mesh.deflection), 0);
  return { data: buf, filename: `${prog.data.name}.stl`, mime: 'model/stl', triangles: n,
    report: { kept: [`geometry (${meshes.length} bod${meshes.length === 1 ? 'y' : 'ies'})`], approximated: [`B-rep → mesh at a linear deflection setting of ${dev.toFixed(3)} mm (curved faces can stray about twice that)`], dropped: ['units (assumed mm)', 'names', 'colours', 'plates', 'settings'], maxDeviation: dev } };
}

export function step(prog, opts = {}) {
  const oc = getOC();
  const r = K.scope();
  try {
    const bodies = prog.kernelBodies();
    const shapes = bodies.map(b => K.isIdentity(b.transform) ? b.body.shape : r(K.transformShape(b.body.shape, b.transform)));
    const comp = r(K.makeCompound(shapes));
    const w = r(new oc.STEPControl_Writer());
    const st = w.Transfer(comp, oc.STEPControl_StepModelType.STEPControl_AsIs, true, r(new oc.Message_ProgressRange()));
    if (st !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('STEP transfer failed');
    const fname = `/jig_${Date.now()}_${Math.floor(Math.random() * 1e6)}.step`;
    const ws = w.Write(fname);
    if (ws !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('STEP write failed');
    const text = oc.FS.readFile(fname, { encoding: 'utf8' });
    oc.FS.unlink(fname);
    return { data: text, filename: `${prog.data.name}.step`, mime: 'model/step',
      report: { kept: [`exact B-rep (${bodies.length} solid${bodies.length === 1 ? '' : 's'})`, 'units (mm)'], approximated: [], dropped: ['persistent names', 'plates', 'slicer settings', 'fit provenance', 'parametric history'] } };
  } finally { r.free(); }
}

export function tmf(prog, opts = {}) {
  const meshes = worldMeshes(prog, opts);
  const objects = [], items = [];
  const colors = [];
  meshes.forEach((m, k) => {
    const id = k + 1;
    const P = m.mesh.positions, I = m.mesh.indices;
    // the display mesh repeats a vertex for each face that uses it; 3MF wants every edge shared by its two triangles,
    // so weld vertices with the same written coordinates and drop triangles that collapse
    const vs = [], at = new Map(), remap = new Int32Array(P.length / 3);
    for (let i = 0; i < P.length; i += 3) {
      const v = K.matApply(m.T, [P[i], P[i + 1], P[i + 2]]);
      const key = `x="${v[0].toFixed(5)}" y="${v[1].toFixed(5)}" z="${v[2].toFixed(5)}"`;
      let k = at.get(key);
      if (k == null) { k = vs.length; at.set(key, k); vs.push(`<vertex ${key}/>`); }
      remap[i / 3] = k;
    }
    const ts = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]];
      if (a !== b && b !== c && a !== c) ts.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
    }
    objects.push(`<object id="${id}" name="${esc(m.id)}" type="model"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`);
    items.push(`<item objectid="${id}"/>`);
  });
  const plates = prog.data.print?.plates ?? [{ index: 1, items: meshes.map(m => ({ body: m.id })) }];
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-GB" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<metadata name="Title">${esc(prog.data.name)}</metadata>\n<metadata name="Application">jigcad</metadata>\n<metadata name="jig:plates">${esc(JSON.stringify(plates.map(p => ({ index: p.index, items: p.items.map(i => i.body) }))))}</metadata>\n<resources>${objects.join('\n')}</resources>\n<build>${items.join('')}</build>\n</model>\n`;
  const ct = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="json" ContentType="application/json"/></Types>\n`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n`;
  const settings = JSON.stringify({ printer: prog.data.print?.printer ?? null, orientation: prog.data.print?.orientation ?? null, layers: prog.data.print?.layers ? { height: prog.data.print.layers.height, count: prog.data.print.layers.count } : null }, null, 1);
  const bytes = zip([{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rels }, { name: '3D/3dmodel.model', data: model }, { name: 'Metadata/jig-settings.json', data: settings }]);
  const dev = Math.max(...meshes.map(m => m.mesh.deflection), 0);
  return { data: bytes.buffer, filename: `${prog.data.name}.3mf`, mime: 'model/3mf',
    report: { kept: ['units (mm)', `plates (${plates.length})`, 'part names', 'settings (as metadata)'], approximated: [`B-rep → mesh at a linear deflection setting of ${dev.toFixed(3)} mm (curved faces can stray about twice that)`], dropped: ['parametric history', 'persistent names', 'joints'], maxDeviation: dev } };
}
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// SVG: orthographic view of edge polylines ('top' | 'front' | 'side' | 'iso')
export function svg(prog, { view = 'iso', size = 512 } = {}) {
  const proj = { top: p => [p[0], -p[1]], front: p => [p[0], -p[2]], side: p => [p[1], -p[2]], iso: p => [(p[0] - p[1]) * 0.866, (p[0] + p[1]) * 0.5 - p[2]] }[view] ?? (p => [p[0], -p[1]]);
  const polys = [];
  for (const { body, transform } of prog.kernelBodies()) for (const e of body.edges.list) { const P = K.edgePolyline(e, 0.05, 0.3); const pts = []; for (let i = 0; i < P.length; i += 3) pts.push(proj(K.matApply(transform, [P[i], P[i + 1], P[i + 2]]))); polys.push(pts); }
  const all = polys.flat(); if (!all.length) return { data: '<svg xmlns="http://www.w3.org/2000/svg"/>', filename: `${prog.data.name}.svg`, mime: 'image/svg+xml', report: { kept: [], approximated: [], dropped: ['everything: no geometry'] } };
  const x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
  const s = (size - 20) / Math.max(x1 - x0, y1 - y0, 1e-9);
  const path = polys.map(pl => 'M' + pl.map(p => `${((p[0] - x0) * s + 10).toFixed(2)},${((p[1] - y0) * s + 10).toFixed(2)}`).join('L')).join('');
  const data = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="${path}" fill="none" stroke="#111" stroke-width="1"/></svg>`;
  return { data, filename: `${prog.data.name}-${view}.svg`, mime: 'image/svg+xml', report: { kept: ['feature edges'], approximated: ['curves as polylines'], dropped: ['hidden-line removal', 'faces'] } };
}

export function irBundle(prog) {
  const d = prog.data;
  const files = [];
  const manifest = { name: d.name, kind: d.kind, hash: d.hash, created: 'jigcad', levels: Object.keys(d.ir), summary: d.summary };
  files.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 1) });
  files.push({ name: 'trace.json', data: JSON.stringify(d.trace, null, 1) });
  files.push({ name: 'diagnostics.json', data: JSON.stringify(d.diagnostics, null, 1) });
  files.push({ name: 'decisions.json', data: JSON.stringify(d.decisions, null, 1) });
  files.push({ name: 'params.json', data: JSON.stringify(d.params, null, 1) });
  files.push({ name: 'graph.json', data: JSON.stringify(d.graph, null, 1) });
  for (const [k, v] of Object.entries(d.ir)) files.push({ name: `${k}.txt`, data: v });
  const bytes = zip(files);
  return { data: bytes.buffer, filename: `${d.name}-ir.zip`, mime: 'application/zip', files: files.map(f => f.name),
    report: { kept: ['manifest', 'trace', 'diagnostics', 'decisions', 'params', 'graph', 'L0–L6 text'], approximated: [], dropped: ['meshes', 'B-rep'] } };
}

export function exportAs(prog, format, opts = {}) {
  switch (format) {
    case 'stl': return stl(prog, opts);
    case 'step': return step(prog, opts);
    case '3mf': case 'tmf': return tmf(prog, opts);
    case 'svg': return svg(prog, opts);
    case 'ir': return irBundle(prog, opts);
  }
  throw new Error(`unknown export format '${format}'`);
}
export const exportTo = {
  stl: (p, o) => stl(p, o), step: (p, o) => step(p, o), tmf: (p, o) => tmf(p, o), svg: (p, o) => svg(p, o), ir: p => irBundle(p),
  to: (fmt, p, o) => exportAs(p, fmt, o),
};
