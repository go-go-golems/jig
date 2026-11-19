// The CalculiX input deck for a linear static study, and its .dat output read back.
//
// One element set (C3D10), one isotropic material, fixed node sets (*BOUNDARY), rollers as a node held along its
// normal (a local frame per node, *TRANSFORM, where the normal is not a global axis), loads as nodal forces
// (*CLOAD). Printed: displacements at every node, reactions at every held set (with totals) and the stress at
// every integration point; the .frd is not written.

const num = (x) => (Number.isFinite(x) ? (Math.abs(x) < 1e-300 ? '0.' : x.toPrecision(12)) : '0.');
const lines = (ids, per = 12) => { const out = []; for (let i = 0; i < ids.length; i += per) out.push(ids.slice(i, i + per).map((n) => n + 1).join(', ')); return out; };

// m: { nodes, tets } (tetmesh.quadratic), material { E (MPa), nu }, fixed: [{ name, nodes }], rollers: [{ name, nodes,
// normals: Map node → n }], forces: Float64Array(3·nodes), eps (a force below it is not written)
export function writeDeck({ mesh, material, fixed = [], rollers = [], forces }) {
  const out = ['** jig: linear static (j.fea)', '*NODE, NSET=NALL'];
  const nn = mesh.nodes.length / 3, ne = mesh.tets.length / 10;
  for (let i = 0; i < nn; i++) out.push(`${i + 1}, ${num(mesh.nodes[3 * i])}, ${num(mesh.nodes[3 * i + 1])}, ${num(mesh.nodes[3 * i + 2])}`);
  out.push('*ELEMENT, TYPE=C3D10, ELSET=EALL');
  for (let e = 0; e < ne; e++) {
    const t = Array.from(mesh.tets.subarray(10 * e, 10 * e + 10), (n) => n + 1);
    out.push(`${e + 1}, ${t.join(', ')}`);
  }
  out.push('*MATERIAL, NAME=M1', '*ELASTIC', `${num(material.E)}, ${num(material.nu)}`, '*SOLID SECTION, ELSET=EALL, MATERIAL=M1');
  const sets = [];
  for (const s of fixed) { const nm = setName(s.name, sets); out.push(`*NSET, NSET=${nm}`, ...lines(s.nodes)); sets.push(nm); s.set = nm; }
  // rollers: a node whose normal is (nearly) a global axis is held along it; any other gets a rectangular frame
  // whose x is its normal (*TRANSFORM, TYPE=R, given by two vectors a, b: x = a, y in the a–b plane)
  const tf = [];
  for (const r of rollers) {
    const nm = setName(r.name, sets); sets.push(nm); r.set = nm;
    out.push(`*NSET, NSET=${nm}`, ...lines(r.nodes));
    for (const n of r.nodes) {
      const v = r.normals.get(n), ax = [0, 1, 2].find((k) => Math.abs(Math.abs(v[k]) - 1) < 1e-9);
      if (ax != null) tf.push({ n, dof: ax + 1 });
      else {
        const b = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], ns = `T${n + 1}`;
        out.push(`*NSET, NSET=${ns}`, `${n + 1}`, `*TRANSFORM, NSET=${ns}, TYPE=R`, `${v.map(num).join(', ')}, ${b.map(num).join(', ')}`);
        tf.push({ n, dof: 1 });
      }
    }
  }
  out.push('*STEP', '*STATIC');
  if (fixed.length || tf.length) {
    out.push('*BOUNDARY');
    for (const s of fixed) out.push(`${s.set}, 1, 3`);
    for (const x of tf) out.push(`${x.n + 1}, ${x.dof}, ${x.dof}`);
  }
  const loaded = [];
  let fmax = 0; for (let i = 0; i < forces.length; i++) fmax = Math.max(fmax, Math.abs(forces[i]));
  for (let i = 0; i < nn; i++) for (let k = 0; k < 3; k++) { const f = forces[3 * i + k]; if (Math.abs(f) > 1e-14 * fmax) loaded.push(`${i + 1}, ${k + 1}, ${num(f)}`); }
  if (loaded.length) out.push('*CLOAD', ...loaded);
  out.push('*NODE PRINT, NSET=NALL, GLOBAL=YES', 'U');
  for (const s of [...fixed, ...rollers]) out.push(`*NODE PRINT, NSET=${s.set}, TOTALS=YES, GLOBAL=YES`, 'RF');
  out.push('*EL PRINT, ELSET=EALL', 'S', '*END STEP', '');
  return out.join('\n');
}
const setName = (name, taken) => {
  let base = String(name ?? 'S').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 60) || 'S';
  if (!/^[A-Z]/.test(base)) base = 'S' + base;
  let nm = base, k = 1; while (taken.includes(nm) || nm === 'NALL' || nm === 'EALL') nm = `${base}_${k++}`;
  return nm;
};

// Read the .dat: { U: Float64Array(3·nodes), S: Float64Array(6·4·elements) (ip-major per element, CalculiX's
// order sxx syy szz sxy sxz syz), RF: { set: { nodes: Map, total: [fx, fy, fz] } } }
export function readDat(text, nn, ne) {
  const U = new Float64Array(3 * nn), S = new Float64Array(24 * ne), RF = {};
  const L = text.split('\n');
  let mode = null, set = null;
  for (const raw of L) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = /^displacements \(vx,vy,vz\) for set (\S+)/i.exec(line))) { mode = 'U'; set = m[1]; continue; }
    if ((m = /^forces \(fx,fy,fz\) for set (\S+)/i.exec(line))) { mode = 'RF'; set = m[1].toUpperCase(); (RF[set] ??= { nodes: new Map(), total: null }); continue; }
    if ((m = /^total force \(fx,fy,fz\) for set (\S+)/i.exec(line))) { mode = 'RFT'; set = m[1].toUpperCase(); (RF[set] ??= { nodes: new Map(), total: null }); continue; }
    if (/^stresses \(elem, integ\.pnt\.,sxx,syy,szz,sxy,sxz,syz\)/i.test(line)) { mode = 'S'; continue; }
    if (/^[a-z]/i.test(line)) { mode = null; continue; }
    const f = line.split(/\s+/).map(Number);
    if (f.some(Number.isNaN)) continue;
    if (mode === 'U' && f.length >= 4) U.set([f[1], f[2], f[3]], 3 * (f[0] - 1));
    else if (mode === 'RF' && f.length >= 4) RF[set].nodes.set(f[0] - 1, [f[1], f[2], f[3]]);
    else if (mode === 'RFT' && f.length >= 3) RF[set].total = [f[0], f[1], f[2]];
    else if (mode === 'S' && f.length >= 8) S.set(f.slice(2, 8), 24 * (f[0] - 1) + 6 * (f[1] - 1));
  }
  return { U, S, RF };
}

/** CalculiX prints RF as the internal force K·u at every component of a printed node: a load applied at a held node
 *  (a body load, a pressure on a supported face) goes straight into the support and never shows as a reaction, and
 *  in a free direction RF equals the load there. The reaction the support gives is K·u − f: this subtracts the applied
 *  nodal forces and recomputes each set's total from its nodes, so the result means what the JavaScript solver's does. */
export function netReactions(RF, forces) {
  const out = {};
  for (const [set, r] of Object.entries(RF)) {
    const nodes = new Map(), total = [0, 0, 0];
    for (const [n, v] of r.nodes) {
      const w = [0, 1, 2].map((k) => v[k] - forces[3 * n + k]);
      nodes.set(n, w);
      for (let k = 0; k < 3; k++) total[k] += w[k];
    }
    out[set] = { nodes, total: r.nodes.size ? total : r.total };
  }
  return out;
}
