//! World-space triangle soups (the records of `meshTris` in src/engine/inspect.js) and a handle registry.
use crate::vec3::*;
use std::cell::RefCell;

/// Face geometry for exact normals. Encoded by JS as GEO_STRIDE f64 per face:
/// [kind, hasNormal, nx, ny, nz, hasAxis, ox, oy, oz, dx, dy, dz, semiAngle (NaN = none)]
/// kind: 0 other · 1 plane · 2 cylinder · 3 cone · 4 sphere
pub const GEO_STRIDE: usize = 13;

#[derive(Clone, Copy, Debug)]
pub struct FaceGeo {
    pub kind: u8,
    pub normal: Option<V3>,
    pub axis: Option<(V3, V3, Option<f64>)>, // origin, dir, semiAngle
}

impl FaceGeo {
    pub fn decode(g: &[f64]) -> FaceGeo {
        let kind = g[0] as u8;
        let normal = if g[1] != 0.0 { Some([g[2], g[3], g[4]]) } else { None };
        let axis = if g[5] != 0.0 { Some(([g[6], g[7], g[8]], [g[9], g[10], g[11]], if g[12].is_nan() { None } else { Some(g[12]) })) } else { None };
        FaceGeo { kind, normal, axis }
    }
    /// meshTris: normals and axis directions rotate (R), axis origins move (matApply)
    fn transformed(&self, m: &[f64; 16]) -> FaceGeo {
        let o = mat_apply(m, [0.0, 0.0, 0.0]);
        let r = |d: V3| unit(sub(mat_apply(m, d), o));
        FaceGeo { kind: self.kind, normal: self.normal.map(r), axis: self.axis.map(|(org, dir, sa)| (mat_apply(m, org), r(dir), sa)) }
    }
}

/// exactNormal in inspect.js: the surface normal of planes, cylinders, cones and spheres, oriented like the facet.
pub fn exact_normal(g: &FaceGeo, p: V3, f_n: V3) -> Option<V3> {
    let sgn = |x: f64| if x < 0.0 { -1.0 } else { 1.0 };
    if g.kind == 1 {
        if let Some(n) = g.normal { return Some(if dot(n, f_n) < 0.0 { neg(n) } else { n }); }
    }
    let (origin, ax, sa) = g.axis?;
    let rel = sub(p, origin);
    if g.kind == 4 { let e = unit(rel); return Some(mul(e, sgn(dot(e, f_n)))); }
    let rad = sub(rel, mul(ax, dot(rel, ax)));
    if len(rad) < 1e-9 { return None; }
    let e = unit(rad);
    if g.kind == 2 { return Some(mul(e, sgn(dot(e, f_n)))); }
    if g.kind == 3 {
        if let Some(sa) = sa { return Some(add(mul(e, sgn(dot(e, f_n)) * sa.cos()), mul(ax, sgn(dot(ax, f_n)) * sa.sin()))); }
    }
    None
}

#[derive(Default, Clone, Debug)]
pub struct TriMesh {
    pub a: Vec<V3>,
    pub b: Vec<V3>,
    pub c: Vec<V3>,
    pub n: Vec<V3>,
    pub area: Vec<f64>,
    pub face: Vec<u32>,
    pub cen: Vec<V3>,
}

impl TriMesh {
    pub fn len(&self) -> usize { self.a.len() }
    pub fn is_empty(&self) -> bool { self.a.is_empty() }

    /// Append one body's display mesh, placed by m (column-major), with optional face geometry.
    pub fn append(&mut self, pos: &[f32], idx: &[u32], tri_face: &[u32], m: &[f64; 16], geo: &[FaceGeo]) {
        let geo_w: Vec<FaceGeo> = geo.iter().map(|g| g.transformed(m)).collect();
        let p = |i: u32| -> V3 { let i = i as usize * 3; [pos[i] as f64, pos[i + 1] as f64, pos[i + 2] as f64] };
        let nt = idx.len() / 3;
        self.reserve(nt);
        for t in 0..nt {
            let a = mat_apply(m, p(idx[3 * t]));
            let b = mat_apply(m, p(idx[3 * t + 1]));
            let c = mat_apply(m, p(idx[3 * t + 2]));
            let cr = cross(sub(b, a), sub(c, a));
            let l = len(cr);
            let face = tri_face.get(t).copied().unwrap_or(0);
            let cen = mul(add(add(a, b), c), 1.0 / 3.0);
            let ok = l != 0.0 && !l.is_nan();   // JS: `l ? … : …` (0 and NaN are falsy)
            let mut nrm = if ok { mul(cr, 1.0 / l) } else { [0.0, 0.0, 1.0] };
            if ok {
                if let Some(g) = geo_w.get(face as usize) { if let Some(e) = exact_normal(g, cen, nrm) { nrm = e; } }
            }
            self.push(a, b, c, nrm, l / 2.0, face, cen);
        }
    }
    pub fn extend(&mut self, o: &TriMesh) {
        self.a.extend_from_slice(&o.a); self.b.extend_from_slice(&o.b); self.c.extend_from_slice(&o.c);
        self.n.extend_from_slice(&o.n); self.area.extend_from_slice(&o.area); self.face.extend_from_slice(&o.face);
        self.cen.extend_from_slice(&o.cen);
    }
    fn reserve(&mut self, k: usize) {
        self.a.reserve(k); self.b.reserve(k); self.c.reserve(k); self.n.reserve(k);
        self.area.reserve(k); self.face.reserve(k); self.cen.reserve(k);
    }
    #[allow(clippy::too_many_arguments)]
    pub fn push(&mut self, a: V3, b: V3, c: V3, n: V3, area: f64, face: u32, cen: V3) {
        self.a.push(a); self.b.push(b); self.c.push(c); self.n.push(n); self.area.push(area); self.face.push(face); self.cen.push(cen);
    }
    /// 17 f64 per triangle: a(3) b(3) c(3) n(3) area face cen(3)
    pub fn records(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.len() * 17);
        for t in 0..self.len() {
            out.extend_from_slice(&self.a[t]); out.extend_from_slice(&self.b[t]); out.extend_from_slice(&self.c[t]);
            out.extend_from_slice(&self.n[t]); out.push(self.area[t]); out.push(self.face[t] as f64); out.extend_from_slice(&self.cen[t]);
        }
        out
    }
    #[inline] pub fn verts(&self, t: usize) -> [V3; 3] { [self.a[t], self.b[t], self.c[t]] }
}

// ── registry: handle = (generation << 16) | (slot + 1) ─────────────────────────
struct Slot { gen: u32, mesh: Option<TriMesh> }
thread_local! { static REG: RefCell<Vec<Slot>> = const { RefCell::new(Vec::new()) }; }

pub fn insert(m: TriMesh) -> u32 {
    REG.with(|r| {
        let mut r = r.borrow_mut();
        let i = match r.iter().position(|s| s.mesh.is_none()) {
            Some(i) => i,
            None => { r.push(Slot { gen: 0, mesh: None }); r.len() - 1 }
        };
        let s = &mut r[i];
        s.gen = (s.gen + 1) & 0x7fff;
        s.mesh = Some(m);
        (s.gen << 16) | (i as u32 + 1)
    })
}
fn slot_of(h: u32) -> Option<(usize, u32)> { let i = (h & 0xffff) as usize; if i == 0 { None } else { Some((i - 1, h >> 16)) } }

pub fn with<R>(h: u32, f: impl FnOnce(&TriMesh) -> R) -> Option<R> {
    let (i, g) = slot_of(h)?;
    REG.with(|r| { let r = r.borrow(); let s = r.get(i)?; if s.gen != g { return None; } s.mesh.as_ref().map(f) })
}
pub fn with_mut<R>(h: u32, f: impl FnOnce(&mut TriMesh) -> R) -> Option<R> {
    let (i, g) = slot_of(h)?;
    REG.with(|r| { let mut r = r.borrow_mut(); let s = r.get_mut(i)?; if s.gen != g { return None; } s.mesh.as_mut().map(f) })
}
/// Free a handle; a stale or unknown handle is ignored (double frees are harmless).
pub fn remove(h: u32) -> bool {
    let Some((i, g)) = slot_of(h) else { return false };
    REG.with(|r| { let mut r = r.borrow_mut(); match r.get_mut(i) { Some(s) if s.gen == g && s.mesh.is_some() => { s.mesh = None; true } _ => false } })
}
pub fn live() -> usize { REG.with(|r| r.borrow().iter().filter(|s| s.mesh.is_some()).count()) }
pub fn clear() { REG.with(|r| for s in r.borrow_mut().iter_mut() { s.mesh = None; }) }
