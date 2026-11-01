//! orientationScore, supportColumns and rayDown from src/engine/inspect.js (same arithmetic, same order).
use crate::mesh::TriMesh;
use crate::vec3::*;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct Score {
    pub dir: V3,
    pub overhang_area: f64,
    pub bed_contact: f64,
    pub height: f64,
    pub support_volume: f64,
    pub overhang_faces: Vec<u32>, // first-appearance order (JS Set insertion order)
    pub lo: f64,
    pub hi: f64,
}

pub fn orientation_score(m: &TriMesh, u: V3, max_angle: f64, bed_tol: f64, support_factor: f64) -> Score {
    let u = unit(u);
    let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
    for t in 0..m.len() {
        for p in m.verts(t) { let h = dot(p, u); if h < lo { lo = h; } if h > hi { hi = h; } }
    }
    let s = (max_angle + 0.5 * std::f64::consts::PI / 180.0).sin();
    let (mut overhang_area, mut bed_contact) = (0.0, 0.0);
    let mut over: Vec<usize> = Vec::new();
    let mut faces: Vec<u32> = Vec::new();
    let mut seen: std::collections::HashSet<u32> = Default::default();
    for t in 0..m.len() {
        let d = -dot(m.n[t], u);
        let [a, b, c] = m.verts(t);
        let max_h = dot(a, u).max(dot(b, u)).max(dot(c, u));
        if d > 1.0 - 1e-6 && max_h - lo < bed_tol { bed_contact += m.area[t]; continue; }
        if d > s + 1e-9 {
            overhang_area += m.area[t];
            over.push(t);
            if seen.insert(m.face[t]) { faces.push(m.face[t]); }
        }
    }
    let support_volume = if over.is_empty() { 0.0 } else { support_columns(m, &over, u, lo) * support_factor };
    Score { dir: u, overhang_area, bed_contact, height: hi - lo, support_volume, overhang_faces: faces, lo, hi }
}

fn support_columns(m: &TriMesh, over: &[usize], u: V3, lo: f64) -> f64 {
    let x = if u[2].abs() > 0.9 { [1.0, 0.0, 0.0] } else { unit(cross([0.0, 0.0, 1.0], u)) };
    let y = cross(u, x);
    let proj = |p: V3| [dot(p, x), dot(p, y)];
    let cell = 2.0;
    let key_of = |i: i64, j: i64| i.wrapping_mul(100003).wrapping_add(j);
    let mut grid: HashMap<i64, Vec<u32>> = HashMap::new();
    for k in 0..m.len() {
        let ps = m.verts(k).map(proj);
        let x0 = (ps[0][0].min(ps[1][0]).min(ps[2][0]) / cell).floor() as i64;
        let x1 = (ps[0][0].max(ps[1][0]).max(ps[2][0]) / cell).floor() as i64;
        let y0 = (ps[0][1].min(ps[1][1]).min(ps[2][1]) / cell).floor() as i64;
        let y1 = (ps[0][1].max(ps[1][1]).max(ps[2][1]) / cell).floor() as i64;
        for i in x0..=x1 { for j in y0..=y1 { grid.entry(key_of(i, j)).or_default().push(k as u32); } }
    }
    let mut vol = 0.0;
    for &t in over {
        let c = m.cen[t];
        let h0 = dot(c, u);
        let q = proj(c);
        let mut floor = lo;
        if let Some(cand) = grid.get(&key_of((q[0] / cell).floor() as i64, (q[1] / cell).floor() as i64)) {
            for &k in cand {
                let k = k as usize;
                if k == t { continue; }
                if dot(m.n[k], u) <= 1e-6 { continue; }   // only upward-facing surfaces hold supports
                if let Some(hit) = ray_down(m.a[k], m.b[k], m.c[k], c, u) {
                    if hit < h0 - 1e-6 && hit > floor { floor = hit; }
                }
            }
        }
        vol += m.area[t] * dot(m.n[t], u).abs() * (h0 - floor).max(0.0);
    }
    vol
}

/// Intersection of the line p − s·u with triangle (a, b, c); returns the height along u.
pub fn ray_down(a: V3, b: V3, c: V3, p: V3, u: V3) -> Option<f64> {
    let e1 = sub(b, a);
    let e2 = sub(c, a);
    let d = neg(u);
    let h = cross(d, e2);
    let aa = dot(e1, h);
    if aa.abs() < 1e-12 { return None; }
    let f = 1.0 / aa;
    let s = sub(p, a);
    let uu = f * dot(s, h);
    if !(-1e-9..=1.0 + 1e-9).contains(&uu) { return None; }
    let qv = cross(s, e1);
    let vv = f * dot(d, qv);
    if vv < -1e-9 || uu + vv > 1.0 + 1e-9 { return None; }
    let tt = f * dot(e2, qv);
    Some(dot(add(p, mul(d, tt)), u))
}
