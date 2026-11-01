//! meshSection from src/engine/print.js (plane z ∩ triangle mesh → closed loops) and loopsProps from inspect.js.
use crate::mesh::TriMesh;
use crate::vec3::V3;
use std::collections::HashMap;

pub type P2 = [f64; 2];

pub fn mesh_section(m: &TriMesh, z: f64) -> Vec<Vec<P2>> {
    let z = z + 1e-7; // keep the plane off vertices
    let cut = |p: V3, q: V3| -> P2 {
        let (a, b) = if p[2] < q[2] || (p[2] == q[2] && (p[0] < q[0] || (p[0] == q[0] && p[1] < q[1]))) { (p, q) } else { (q, p) };
        let t = (z - a[2]) / (b[2] - a[2]);
        [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    };
    let mut segs: Vec<[P2; 2]> = Vec::new();
    for t in 0..m.len() {
        let p = m.verts(t);
        let above = [p[0][2] > z, p[1][2] > z, p[2][2] > z];
        if above[0] == above[1] && above[1] == above[2] { continue; }
        let mut pts: Vec<P2> = Vec::with_capacity(2);
        for i in 0..3 { if above[i] != above[(i + 1) % 3] { pts.push(cut(p[i], p[(i + 1) % 3])); } }
        if pts.len() == 2 { segs.push([pts[0], pts[1]]); }
    }
    let key = |p: P2| -> (i64, i64) { ((p[0] * 1e6).round() as i64, (p[1] * 1e6).round() as i64) }; // toFixed(6)
    let mut at: HashMap<(i64, i64), Vec<(usize, usize)>> = HashMap::new();
    for (i, sg) in segs.iter().enumerate() { for e in 0..2 { at.entry(key(sg[e])).or_default().push((i, e)); } }
    let mut used = vec![false; segs.len()];
    let mut loops = Vec::new();
    for i in 0..segs.len() {
        if used[i] { continue; }
        used[i] = true;
        let mut lp = vec![segs[i][0], segs[i][1]];
        let mut end = segs[i][1];
        let k0 = key(lp[0]);
        loop {
            let next = at.get(&key(end)).and_then(|l| l.iter().find(|(j, _)| !used[*j]).copied());
            let Some((j, e)) = next else { break };
            used[j] = true;
            end = segs[j][1 - e];
            if key(end) == k0 { break; }
            lp.push(end);
        }
        if lp.len() >= 3 { loops.push(lp); }
    }
    loops
}

pub fn poly_area(l: &[P2]) -> f64 {
    let mut a = 0.0;
    for i in 0..l.len() { let p = l[i]; let q = l[(i + 1) % l.len()]; a += p[0] * q[1] - q[0] * p[1]; }
    a / 2.0
}

#[derive(Debug, Clone, PartialEq)]
pub struct LoopProps { pub area: f64, pub centroid: P2, pub ixx: f64, pub iyy: f64, pub regions: u32, pub holes: u32 }

pub fn loops_props(loops: &[Vec<P2>]) -> LoopProps {
    let raw: Vec<(&Vec<P2>, f64)> = loops.iter().map(|l| (l, poly_area(l))).collect();
    let inside = |p: P2, l: &[P2]| -> bool {
        let mut c = false;
        let n = l.len();
        let mut j = n.wrapping_sub(1);
        for i in 0..n {
            if ((l[i][1] > p[1]) != (l[j][1] > p[1])) && (p[0] < (l[j][0] - l[i][0]) * (p[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0]) { c = !c; }
            j = i;
        }
        c
    };
    let (mut a, mut sx, mut sy, mut ixx, mut iyy) = (0.0, 0.0, 0.0, 0.0, 0.0);
    let (mut regions, mut holes) = (0u32, 0u32);
    for (ri, r) in raw.iter().enumerate() {
        if r.0.is_empty() { continue; }
        let depth = raw.iter().enumerate().filter(|(oi, o)| *oi != ri && o.1.abs() > r.1.abs() && inside(r.0[0], o.0)).count();
        let sgn = if depth % 2 == 0 { 1.0 } else { -1.0 };
        if sgn > 0.0 { regions += 1 } else { holes += 1 }
        let s = js_sign(r.1) * sgn;
        let l = r.0;
        for i in 0..l.len() {
            let [x0, y0] = l[i];
            let [x1, y1] = l[(i + 1) % l.len()];
            let c = x0 * y1 - x1 * y0;
            a += s * c / 2.0; sx += s * (x0 + x1) * c / 6.0; sy += s * (y0 + y1) * c / 6.0;
            iyy += s * (x0 * x0 + x0 * x1 + x1 * x1) * c / 12.0; ixx += s * (y0 * y0 + y0 * y1 + y1 * y1) * c / 12.0;
        }
    }
    let cx = if a != 0.0 { sx / a } else { 0.0 };
    let cy = if a != 0.0 { sy / a } else { 0.0 };
    LoopProps { area: a, centroid: [cx, cy], ixx: ixx - a * cy * cy, iyy: iyy - a * cx * cx, regions, holes }
}
/// Math.sign (0 stays 0)
fn js_sign(x: f64) -> f64 { if x > 0.0 { 1.0 } else if x < 0.0 { -1.0 } else { x } }

/// Loops are exchanged with JS as [nLoops, len₀, x, y, …, len₁, …].
pub fn encode_loops(loops: &[Vec<P2>]) -> Vec<f64> {
    let mut out = vec![loops.len() as f64];
    for l in loops { out.push(l.len() as f64); for p in l { out.push(p[0]); out.push(p[1]); } }
    out
}
pub fn decode_loops(v: &[f64]) -> Vec<Vec<P2>> {
    let mut out = Vec::new();
    if v.is_empty() { return out; }
    let n = v[0] as usize;
    let mut i = 1;
    for _ in 0..n {
        if i >= v.len() { break; }
        let k = v[i] as usize; i += 1;
        let mut l = Vec::with_capacity(k);
        for _ in 0..k { if i + 1 >= v.len() { break; } l.push([v[i], v[i + 1]]); i += 2; }
        out.push(l);
    }
    out
}
