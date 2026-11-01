//! meshGap from src/engine/inspect.js: smallest distance between two triangle meshes up to maxD, with crossing
//! and containment tests so that meshes passing through or lying inside each other report 0.
use crate::mesh::TriMesh;
use crate::vec3::*;
use std::collections::{HashMap, HashSet};

type Cell = (i64, i64, i64);
struct Grid { cells: HashMap<Cell, Vec<u32>>, big: Vec<u32> }

fn build_grid(t: &TriMesh, max_d: f64, h: f64) -> Grid {
    let mut cells: HashMap<Cell, Vec<u32>> = HashMap::new();
    let mut big = Vec::new();
    for n in 0..t.len() {
        let [a, b, c] = t.verts(n);
        let lo: [i64; 3] = std::array::from_fn(|d| ((a[d].min(b[d]).min(c[d]) - max_d) / h).floor() as i64);
        let hi: [i64; 3] = std::array::from_fn(|d| ((a[d].max(b[d]).max(c[d]) + max_d) / h).floor() as i64);
        let count = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
        if count > 4096 { big.push(n as u32); continue; }
        for i in lo[0]..=hi[0] { for j in lo[1]..=hi[1] { for k in lo[2]..=hi[2] { cells.entry((i, j, k)).or_default().push(n as u32); } } }
    }
    Grid { cells, big }
}
#[inline] fn cell_of(p: V3, h: f64) -> Cell { ((p[0] / h).floor() as i64, (p[1] / h).floor() as i64, (p[2] / h).floor() as i64) }
/// the toFixed(5) keys of the JS code, as integers
#[inline] fn qkey(p: V3) -> [i64; 3] { p.map(|v| (v * 1e5).round() as i64) }

pub fn mesh_gap(a: &TriMesh, b: &TriMesh, max_d: f64) -> f64 {
    let h = max_d.max(0.25);
    let mut best = f64::INFINITY;
    let mut pass = |p: &TriMesh, t: &TriMesh| {
        let g = build_grid(t, max_d, h);
        let mut seen: HashSet<[i64; 3]> = HashSet::new();
        for n in 0..p.len() {
            for v in p.verts(n) {
                if !seen.insert(qkey(v)) { continue; }
                let cell = g.cells.get(&cell_of(v, h));
                for &k in cell.into_iter().flatten().chain(g.big.iter()) {
                    let [ta, tb, tc] = t.verts(k as usize);
                    let d = point_tri(v, ta, tb, tc);
                    if d < best { best = d; }
                }
            }
        }
    };
    pass(a, b);
    pass(b, a);
    if best > 1e-9 && (edges_cross(a, b, max_d, h) || edges_cross(b, a, max_d, h)) { best = 0.0; }
    if best > 1e-9 && !a.is_empty() && !b.is_empty() && (inside(a.a[0], b) || inside(b.a[0], a)) { best = 0.0; }
    if best <= max_d { best } else { f64::INFINITY }
}

fn edges_cross(p: &TriMesh, t: &TriMesh, max_d: f64, h: f64) -> bool {
    let g = build_grid(t, max_d, h);
    let mut seen: HashSet<([i64; 3], [i64; 3])> = HashSet::new();
    let mut cand: Vec<u32> = Vec::new();
    let mut mark: Vec<u32> = vec![0; t.len()];
    let mut stamp = 0u32;
    for n in 0..p.len() {
        let [va, vb, vc] = p.verts(n);
        for (s, e) in [(va, vb), (vb, vc), (vc, va)] {
            let (ks, ke) = (qkey(s), qkey(e));
            let id = if ks < ke { (ks, ke) } else { (ke, ks) };
            if !seen.insert(id) { continue; }
            let l = len(sub(e, s));
            let steps = ((l / (h / 2.0)).ceil() as i64).max(1);
            stamp += 1;
            cand.clear();
            for &k in &g.big { if mark[k as usize] != stamp { mark[k as usize] = stamp; cand.push(k); } }
            for st in 0..=steps {
                let x = add(s, mul(sub(e, s), st as f64 / steps as f64));
                if let Some(list) = g.cells.get(&cell_of(x, h)) {
                    for &k in list { if mark[k as usize] != stamp { mark[k as usize] = stamp; cand.push(k); } }
                }
            }
            for &k in &cand {
                let [ta, tb, tc] = t.verts(k as usize);
                if seg_tri(s, e, ta, tb, tc) { return true; }
            }
        }
    }
    false
}

fn inside(p: V3, t: &TriMesh) -> bool {
    let mut far: f64 = 0.0;
    for n in 0..t.len() { for v in t.verts(n) { far = far.max((v[0] - p[0]).abs()).max((v[1] - p[1]).abs()).max((v[2] - p[2]).abs()); } }
    let q = add(p, mul([1.0, 0.000123, 0.000457], 2.0 * far + 1.0));   // skewed, so it misses edges and vertices
    let mut count = 0;
    for n in 0..t.len() { let [a, b, c] = t.verts(n); if seg_tri(p, q, a, b, c) { count += 1; } }
    count % 2 == 1
}

/// Does the segment p–q cross the triangle's interior (Möller–Trumbore)? Touching at an end or an edge does not count.
pub fn seg_tri(p: V3, q: V3, a: V3, b: V3, c: V3) -> bool {
    let d = sub(q, p);
    let e1 = sub(b, a);
    let e2 = sub(c, a);
    let s = cross(d, e2);
    let det = dot(e1, s);
    if det.abs() < 1e-12 { return false; }
    let inv = 1.0 / det;
    let o = sub(p, a);
    let u = dot(o, s) * inv;
    if u <= 1e-9 || u >= 1.0 - 1e-9 { return false; }
    let r = cross(o, e1);
    let v = dot(d, r) * inv;
    if v <= 1e-9 || u + v >= 1.0 - 1e-9 { return false; }
    let w = dot(e2, r) * inv;
    w > 1e-9 && w < 1.0 - 1e-9
}

/// Distance from p to triangle (a, b, c) (Ericson, Real-Time Collision Detection 5.1.5).
pub fn point_tri(p: V3, a: V3, b: V3, c: V3) -> f64 {
    let ab = sub(b, a);
    let ac = sub(c, a);
    let ap = sub(p, a);
    let d1 = dot(ab, ap);
    let d2 = dot(ac, ap);
    if d1 <= 0.0 && d2 <= 0.0 { return len(ap); }
    let bp = sub(p, b);
    let d3 = dot(ab, bp);
    let d4 = dot(ac, bp);
    if d3 >= 0.0 && d4 <= d3 { return len(bp); }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 { return len(sub(p, add(a, mul(ab, d1 / (d1 - d3))))); }
    let cp = sub(p, c);
    let d5 = dot(ab, cp);
    let d6 = dot(ac, cp);
    if d6 >= 0.0 && d5 <= d6 { return len(cp); }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 { return len(sub(p, add(a, mul(ac, d2 / (d2 - d6))))); }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && d4 - d3 >= 0.0 && d5 - d6 >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return len(sub(p, add(b, mul(sub(c, b), w))));
    }
    let den = 1.0 / (va + vb + vc);
    let v = vb * den;
    let w = vc * den;
    len(sub(p, add(a, add(mul(ab, v), mul(ac, w)))))
}
