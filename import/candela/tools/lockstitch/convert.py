#!/usr/bin/env python3
"""Lockstitch head (jig CAD + kine rig) -> a Candela data module.

    python3 -I tools/lockstitch/convert.py <meshes.json> <rigdata.json> <out.js>

Input: the animation page's meshes.json (OpenCascade tessellation of every part, per body: positions, normals,
indices, a B-rep face per triangle, face names and kinds) and rigdata.json (the kine rig baked at 1 degree: a
world frame per joint, and the outputs).

Output: one ES module `export default { ... }` with, per part, its bodies quantised (int16 positions in the
body's box, int16 normals, uint16 indices, uint16 face per triangle) and each face's finish metadata; the joint
frames per degree; and the cloth's travel per degree. Everything is converted to Candela's frame: metres, y up
(CAD: mm, z up, front of the machine toward -y; Candela: x' = x, y' = z, z' = -y, so the front faces +z).
"""
import base64, json, math, sys
import numpy as np

meshes_path, rig_path, out_path = sys.argv[1:4]
M = json.load(open(meshes_path))
R = json.load(open(rig_path))
JOINTS, OUTS = R['JOINTS'], R['OUTS']

# ---- the frame change: G (CAD -> Candela) and the unit change ----
G = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=np.float64)
MM = 0.001
QG = np.array([-math.sin(math.pi / 4), 0, 0, math.cos(math.pi / 4)])       # rotation about x by -90 deg, (x, y, z, w)

def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return np.array([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz])
QGi = QG * np.array([-1, -1, -1, 1])
def conj_frame(p, q):
    p2 = G @ np.asarray(p, dtype=np.float64) * MM
    q2 = qmul(qmul(QG, np.asarray(q, dtype=np.float64)), QGi)
    if q2[3] < 0: q2 = -q2
    return p2, q2 / np.linalg.norm(q2)

b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode('ascii')
f32 = lambda s: np.frombuffer(base64.b64decode(s), dtype=np.float32)
u32 = lambda s: np.frombuffer(base64.b64decode(s), dtype=np.uint32)

# ---- which joint carries which part (from the page), and fixed phases ----
JOINT_OF = {'crank': 'arm/shaft', 'handwheel': 'arm/shaft', 'pulleyUpper': 'arm/shaft', 'nbLink': 'arm/link', 'takeupLever': 'arm/lever',
            'takeupLink': 'rocker/link', 'needleBar': 'needle/bar', 'needle': 'needle/bar', 'gate': 'needle/gate', 'hook': 'hook/body',
            'hookGear': 'hook/body', 'lowerShaft': 'lower/shaft', 'lowerGear': 'lower/shaft', 'strap': 'lower/strap', 'rockShaft': 'feed/rock',
            'feedBar': 'feed/bar', 'checkSpring': 'check/arm'}
PHASE = {'hookGear': ('z', 15.0)}
# what each part is made of (finish.fromMetadata vocabulary)
MATERIAL = {
    'crank': {'material': 'steel'}, 'handwheel': {'material': 'cast-iron', 'finish': 'paint', 'color': '#34373c'},
    'pulleyUpper': {'material': 'aluminium'}, 'belt': {'material': 'rubber', 'color': '#353535'},
    'nbLink': {'material': 'steel'}, 'needleBar': {'material': 'chrome'}, 'needle': {'material': 'nickel'},
    'gate': {'material': 'cast-iron', 'finish': 'paint', 'color': '#3c4a3f'}, 'gateBracket': {'material': 'cast-iron', 'finish': 'paint', 'color': '#3c4a3f'},
    'takeupLever': {'material': 'chrome'}, 'takeupLink': {'material': 'steel'}, 'takeupStud': {'material': 'steel', 'finish': 'black-oxide'},
    'tension': {'material': 'chrome'}, 'checkSpring': {'material': 'steel', 'finish': 'black-oxide'}, 'guides': {'material': 'chrome'},
    'presser': {'material': 'chrome'}, 'needlePlate': {'material': 'chrome'},
    'hook': {'material': 'bearing-steel'}, 'hookGear': {'material': 'bronze'}, 'bobbinCase': {'material': 'stainless'}, 'bobbin': {'material': 'aluminium'},
    'finger': {'material': 'steel'}, 'lowerShaft': {'material': 'steel'}, 'lowerGear': {'material': 'steel'},
    'strap': {'material': 'cast-iron'}, 'rockShaft': {'material': 'steel'}, 'feedBar': {'material': 'steel'},
}

# parts made on a lathe (or with lathe-faced hubs): their turned and flat faces get grooves about the part's axis;
# links, levers, brackets and castings get an isotropic machined finish
LATHE = {'crank', 'handwheel', 'pulleyUpper', 'needleBar', 'needle', 'hook', 'hookGear', 'bobbinCase', 'bobbin', 'lowerShaft', 'lowerGear', 'rockShaft', 'tension', 'presser'}
# … and of those, the ones whose flat ends are big enough to show facing rings (each distinct axis is a material)
FACED = {'handwheel', 'pulleyUpper', 'hook', 'hookGear', 'lowerGear', 'bobbin', 'bobbinCase', 'tension'}

def rot_local(axis, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return {'x': np.array([[1, 0, 0], [0, c, -s], [0, s, c]]), 'y': np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]), 'z': np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]

def cyl_axis(P, N):
    """axis and a point on it for a turned (cylindrical / conical) face from its vertices and normals"""
    C = N.T @ N
    w, V = np.linalg.eigh(C)
    a = V[:, 0]; a /= np.linalg.norm(a)
    # project onto the plane across the axis, fit a circle (Kasa)
    u = np.cross(a, [1, 0, 0] if abs(a[0]) < 0.9 else [0, 1, 0]); u /= np.linalg.norm(u); v = np.cross(a, u)
    x, y = P @ u, P @ v
    A = np.c_[2 * x, 2 * y, np.ones_like(x)]
    try: (cx, cy, _), *_ = np.linalg.lstsq(A, x * x + y * y, rcond=None)
    except Exception: return a, P.mean(0), 0.0
    c = cx * u + cy * v + a * float((P @ a).mean())
    r = float(np.sqrt(np.maximum(0, ((x - cx) ** 2 + (y - cy) ** 2))).mean())
    return a, c, r

parts = {}
stats = {'tris': 0, 'verts': 0, 'turned': 0, 'faced': 0}
for name, rec in M.items():
    bodies = []
    for b in rec['bodies']:
        mesh = b['mesh']
        P = f32(mesh['positions']).reshape(-1, 3).astype(np.float64)
        N = f32(mesh['normals']).reshape(-1, 3).astype(np.float64)
        I = u32(mesh['indices']).reshape(-1, 3)
        TF = u32(mesh['triFace'])
        if name in PHASE:
            Rm = rot_local(*PHASE[name]); P = P @ Rm.T; N = N @ Rm.T
        faces = b['faces']
        # the part's lathe axis: the largest turned face; coaxial turned faces and the flat faces across that
        # axis get grooves about it (turned / faced), the rest an isotropic machined finish
        tri_area = np.linalg.norm(np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]]), axis=1) / 2
        geo = {}
        for k, f in enumerate(faces):
            sel = TF == k
            if not sel.any(): continue
            vi = np.unique(I[sel].ravel())
            geo[k] = {'area': float(tri_area[sel].sum()), 'kind': f['kind']}
            if f['kind'] in ('cylinder', 'cone') and len(vi) >= 6:
                a, c, r = cyl_axis(P[vi], N[vi]); geo[k].update(axis=a, center=c, r=r)
            if f['kind'] == 'plane':
                n = N[vi].mean(0); geo[k]['normal'] = n / (np.linalg.norm(n) or 1)
        turned = [k for k, g in geo.items() if 'axis' in g]
        main = max(turned, key=lambda k: geo[k]['area']) if turned and name in LATHE else None
        meta = []
        for k, f in enumerate(faces):
            g = geo.get(k, {'kind': f['kind']}); m = {'kind': f['kind']}
            if main is not None and 'axis' in geo[main]:
                A, Cc = geo[main]['axis'], geo[main]['center']
                A = A if A[np.argmax(np.abs(A))] > 0 else -A
                Cc = Cc - A * float(Cc @ A)                       # the axis point nearest the origin: coaxial parts share it
                off = lambda p: np.linalg.norm(np.cross(p - Cc, A))
                if 'axis' in g and abs(float(g['axis'] @ A)) > 0.995 and off(g['center']) < 0.3:
                    m.update(process='turned', axis=(G @ A).round(3).tolist(), center=(G @ Cc * MM).round(4).tolist()); stats['turned'] += 1
                elif name in FACED and 'normal' in g and abs(float(g['normal'] @ A)) > 0.995:
                    m.update(process='faced', axis=(G @ A).round(3).tolist(), center=(G @ Cc * MM).round(4).tolist()); stats['faced'] += 1
            if 'process' not in m: m.update(process='polished', roughness=0.3)
            meta.append([f['name'], m])
        # into Candela's frame, quantised
        Pc = (P @ G.T) * MM; Nc = N @ G.T
        lo, hi = Pc.min(0), Pc.max(0); span = np.maximum(hi - lo, 1e-9)
        q = np.round((Pc - lo) / span * 65535 - 32768).clip(-32768, 32767).astype('<i2')
        nq = np.round(Nc / np.maximum(np.linalg.norm(Nc, axis=1, keepdims=True), 1e-12) * 32767).astype('<i2')
        assert len(P) < 65536
        bodies.append({'n': int(len(P)), 't': int(len(I)), 'lo': lo.round(7).tolist(), 'hi': hi.round(7).tolist(),
                       'p': b64(q), 'nrm': b64(nq), 'i': b64(I.astype('<u2')), 'f': b64(TF.astype('<u2')), 'faces': meta})
        stats['tris'] += len(I); stats['verts'] += len(P)
    parts[name] = {'joint': JOINT_OF.get(name), 'meta': MATERIAL.get(name, {'material': 'steel'}), 'bodies': bodies}

# ---- the rig: joint frames per degree, in Candela's frame ----
def span_frames(sp, joints):
    a = f32(sp['data']).reshape(sp['n'], sp['stride'])
    out = np.zeros((sp['n'], len(joints), 7), dtype=np.float32)
    for jn, j in enumerate(joints):
        k = JOINTS.index(j) * 7
        for i in range(sp['n']):
            p, q = conj_frame(a[i, k:k + 3], a[i, k + 3:k + 7])
            if i and float(q @ out[i - 1, jn, 3:7]) < 0: q = -q        # keep neighbouring samples on one hemisphere
            out[i, jn, :3] = p; out[i, jn, 3:] = q
    return a, out
turn_raw, turn = span_frames(R['spans']['turn'], JOINTS)
zz_raw, zz_all = span_frames(R['spans']['zz'], JOINTS)
# the zigzag span only differs for the joints the gate moves; keep those
wrapped = turn[np.arange(zz_all.shape[0]) % 360]
differs = [j for jn, j in enumerate(JOINTS) if np.abs(zz_all[:, jn, :3] - wrapped[:, jn, :3]).max() > 1e-6 or np.abs(np.abs((zz_all[:, jn, 3:] * wrapped[:, jn, 3:]).sum(1)) - 1).max() > 1e-6]
zz = zz_all[:, [JOINTS.index(j) for j in differs], :]

# ---- the cloth: it moves with the feed dog while the dog is above the plate ----
oi = lambda k: len(JOINTS) * 7 + OUTS.index(k)
lift, adv = turn_raw[:, oi('feedLift')], turn_raw[:, oi('feedAdvance')]
up = [d for d in range(360) if lift[d] > 0]
a0, a1 = up[0], up[-1]
stitch = float(adv[a1] - adv[a0])
def fabric_y(deg):
    n = math.floor(deg / 360); d = deg - 360 * n
    within = 0 if d < a0 else stitch if d > a1 else float(adv[int(d)] - adv[a0])
    return n * stitch + within
cloth = np.array([fabric_y(d) for d in range(0, 721)], dtype=np.float32)        # mm along CAD y

# the needle's sideways position at each penetration of the zigzag (CAD x, mm), for the seam drawn on the cloth
npt = JOINTS.index('needle/point') * 7
zig_x = [float(zz_raw[0, npt]), float(zz_raw[360, npt])]

GEO = R['GEO']
data = {
    'about': 'Lockstitch head: parts from jig (OpenCascade), motion from the kine rig baked at 1 degree. Generated by tools/lockstitch/convert.py.',
    'frame': 'metres, y up; CAD x = x, CAD z = y, CAD y = -z (the front of the machine faces +z)',
    'JOINTS': JOINTS,
    'events': {'needleIn': R['NEEDLE_IN'], 'needleOut': R['NEEDLE_OUT'], 'dogUp': a0, 'dogDown': a1, 'stitchMM': stitch, 'zigzagX': [x * MM for x in zig_x]},
    'GEO': {'plateTop': GEO['plate']['top'] * MM, 'fabricTop': R['fabricTop'] * MM, 'hookC': GEO['hook']['c']},
    'parts': parts,
    'rig': {'turn': {'n': int(turn.shape[0]), 'span': 360, 'joints': JOINTS, 'data': b64(turn)},
            'zz': {'n': int(zz.shape[0]), 'span': 720, 'width': 4, 'joints': differs, 'data': b64(zz)}},
    'cloth': {'per': 'degree', 'stitch': stitch * MM, 'data': b64(cloth * MM)},
}
src = '// generated — tools/lockstitch/convert.py from the Lockstitch head bundle (jig CAD, kine rig). Do not edit.\nexport default ' + json.dumps(data, separators=(',', ':')) + ';\n'
open(out_path, 'w').write(src)
print(f"parts {len(parts)} · triangles {stats['tris']} · vertices {stats['verts']} · turned faces {stats['turned']} · faced {stats['faced']} · zigzag joints {differs} · stitch {stitch:.3f} mm (dog up {a0}-{a1} deg) · {len(src) / 1024:.0f} KB")
