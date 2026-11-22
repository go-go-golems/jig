#!/usr/bin/env python3
"""What candela:tools/lockstitch/convert.py made of the lockstitch head's faces, as the expectations of
test/render/lockstitch.test.mjs: per part and face, the process the converter gave (turned / faced / polished)
with its axis and centre, and, for every cylinder and cone, the converter's own per-face axis fit (cyl_axis).

Rerun (from any directory except the extracted project; it reads its inputs, it runs nothing from them):

    python3 -I test/render/fixtures/lockstitch/gen-expected.py \\
        <pbr-spark>/tools/lockstitch/convert.py <project>/animation/web/meshes.json \\
        <project>/animation/web/rigdata.json test/render/fixtures/lockstitch/expected.json [<scratch dir>]

How:
  1. convert.py itself runs (a subprocess, python3 -I) on meshes.json + rigdata.json into <scratch dir>; its output
     module's parts[name].bodies[i].faces are [name, meta] pairs in meshes.json's face order. Those metas, as
     rendered in Candela's preset K-09, are the `p` (process), `a` (axis) and `c` (centre) below.
  2. convert.py's cyl_axis and its tables (LATHE, FACED, PHASE, MATERIAL) are read out of its source with ast and
     run here on meshes.json's vertices and normals, giving every cylinder and cone (>= 6 vertices, the
     converter's own condition) its fitted axis line and radius: `fit`. The converter only keeps the fit of
     the part's largest turned face (its lathe axis); the test compares jig's exact axes against every fit.
  3. hookGear: convert.py turns the gear 15 deg about its local z (PHASE, to mesh with the hook's gear) before it
     fits. jig's package is unturned, so the converter's axes and centres are turned back here (`unphased`).

Frames: everything in Candela's frame as jig's package is (metres, +Y up): p' = 0.001 * (x, z, -y), directions
without the 0.001. Axes are unit vectors with an arbitrary sign; centres are the axis point nearest the origin.
"""
import ast, base64, hashlib, json, math, os, subprocess, sys, tempfile
import numpy as np

conv_path, meshes_path, rig_path, out_path = sys.argv[1:5]
_tmp = None if len(sys.argv) > 5 else tempfile.TemporaryDirectory(prefix='lockstitch-expected-')   # removed at exit
scratch = sys.argv[5] if len(sys.argv) > 5 else _tmp.name
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

# ---- 1. the converter's output ----
conv_out = os.path.join(scratch, 'lockstitch-data.js')
run = subprocess.run([sys.executable, '-I', conv_path, meshes_path, rig_path, conv_out], capture_output=True, text=True, cwd=scratch)
if run.returncode: sys.exit(f'convert.py failed:\n{run.stderr}')
src = open(conv_out).read()
body = src[src.index('export default ') + len('export default '):].rstrip().rstrip(';')
OUT = json.loads(body)['parts']

# ---- 2. the converter's fit and tables, from its source ----
tree = ast.parse(open(conv_path).read())
ns = {'np': np, 'math': math}
want = {'cyl_axis', 'rot_local', 'G', 'MM', 'LATHE', 'FACED', 'PHASE', 'MATERIAL'}
for node in tree.body:
    names = [node.name] if isinstance(node, ast.FunctionDef) else [t.id for t in node.targets if isinstance(t, ast.Name)] if isinstance(node, ast.Assign) else []
    if want & set(names): exec(compile(ast.Module([node], []), conv_path, 'exec'), ns)
missing = want - set(ns)
if missing: sys.exit(f'convert.py no longer defines {sorted(missing)}')
cyl_axis, G, MM = ns['cyl_axis'], ns['G'], ns['MM']

M = json.load(open(meshes_path))
f32 = lambda s: np.frombuffer(base64.b64decode(s), dtype=np.float32)
u32 = lambda s: np.frombuffer(base64.b64decode(s), dtype=np.uint32)
r6 = lambda v: [round(float(x), 6) for x in v]
r7 = lambda v: [round(float(x), 7) for x in v]

def line_nearest_origin(a, c):
    a = a / np.linalg.norm(a)
    return c - a * float(c @ a)

parts = {}
for name, rec in M.items():
    phase = ns['PHASE'].get(name)
    Rm = ns['rot_local'](*phase) if phase else np.eye(3)
    unG = lambda v: G.T @ np.asarray(v, dtype=np.float64)        # Candela -> CAD (directions)
    bodies = []
    for bi, b in enumerate(rec['bodies']):
        mesh = b['mesh']
        P = f32(mesh['positions']).reshape(-1, 3).astype(np.float64)
        N = f32(mesh['normals']).reshape(-1, 3).astype(np.float64)
        I = u32(mesh['indices']).reshape(-1, 3)
        TF = u32(mesh['triFace'])
        conv_faces = OUT[name]['bodies'][bi]['faces']
        assert [f['name'] for f in b['faces']] == [n for n, _ in conv_faces], f'{name}: face order'
        tri_area = np.linalg.norm(np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]]), axis=1) / 2
        faces = []
        for k, (f, (_, m)) in enumerate(zip(b['faces'], conv_faces)):
            sel = TF == k
            vi = np.unique(I[sel].ravel()) if sel.any() else np.array([], dtype=np.int64)
            e = {'n': f['name'], 'k': f['kind'], 'p': m['process'], 'area': round(float(tri_area[sel].sum()) * MM * MM, 10), 'nv': int(len(vi))}
            if 'axis' in m:
                a, c = np.array(m['axis'], dtype=np.float64), np.array(m['center'], dtype=np.float64)
                if phase:   # back through the PHASE turn: CAD frame, Rm^T, Candela frame
                    a = G @ (Rm.T @ unG(a)); c = G @ (Rm.T @ unG(c / MM)) * MM
                e['a'] = r6(a); e['c'] = r7(c)
            if f['kind'] in ('cylinder', 'cone') and len(vi) >= 6:
                a, c, r = cyl_axis(P[vi], N[vi])                 # unturned mesh: jig's frame (CAD, mm)
                w = np.linalg.eigvalsh(N[vi].T @ N[vi] / len(vi))
                e['fit'] = {'a': r6(G @ a), 'c': r7(G @ line_nearest_origin(a, c) * MM), 'r': round(r * MM, 7),
                            'w': [round(float(x), 6) for x in w]}    # eigenvalues of N^T N / n: w[1] small = a narrow arc
            faces.append(e)
        bodies.append({'id': b['id'], 'faces': faces})
    parts[name] = {'material': ns['MATERIAL'].get(name, {'material': 'steel'}), 'lathe': name in ns['LATHE'], 'faced': name in ns['FACED'],
                   **({'phase': {'axis': phase[0], 'deg': phase[1], 'unphased': True}} if phase else {}), 'bodies': bodies}

doc = {
    'about': 'convert.py (candela:tools/lockstitch) on the lockstitch head: per face its process, axis and centre, and the per-face '
             'cyl_axis fit; Candela frame (m, +Y up). Generated by gen-expected.py (see its header). Do not edit.',
    'inputs': {'convert.py': sha(conv_path), 'meshes.json': sha(meshes_path), 'rigdata.json': sha(rig_path)},
    'converter': run.stdout.strip(),
    'parts': parts,
}
with open(out_path, 'w') as fh:
    fh.write('{\n')
    head = [f'  {json.dumps(k)}: {json.dumps(v)}' for k, v in doc.items() if k != 'parts']
    fh.write(',\n'.join(head) + ',\n  "parts": {\n')
    fh.write(',\n'.join(f'    {json.dumps(k)}: {json.dumps(v, separators=(",", ":"))}' for k, v in parts.items()))
    fh.write('\n  }\n}\n')
print(f'{out_path}: {sum(len(b["faces"]) for p in parts.values() for b in p["bodies"])} faces of {len(parts)} parts, {os.path.getsize(out_path) // 1024} KB')
