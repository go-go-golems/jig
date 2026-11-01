//! The stage's software depth buffer and hidden-line classification (src/stage/raster.js, src/stage/lines.js).
//! Frames (depth f32 + face id i32 per device pixel) live in wasm memory so JS can read them through views and the
//! line pass can test samples against them without copies. Arithmetic follows the JS: f64 math, f32 storage.
use std::cell::RefCell;

pub struct Frame { pub w: usize, pub h: usize, pub depth: Vec<f32>, pub id: Vec<i32>, pub bbox: [i32; 4] /* x0 y0 x1 y1 */ }

impl Frame {
    pub fn new(w: usize, h: usize) -> Frame { Frame { w, h, depth: vec![f32::NEG_INFINITY; w * h], id: vec![-1; w * h], bbox: [w as i32, h as i32, -1, -1] } }
    /// buffers(): clear only what the last raster touched, then reset the dirty rectangle
    pub fn clear(&mut self) {
        let [x0, y0, x1, y1] = self.bbox;
        if x1 >= x0 {
            for y in y0.max(0)..=y1.min(self.h as i32 - 1) {
                let (a, b) = (y as usize * self.w + x0.max(0) as usize, y as usize * self.w + x1.min(self.w as i32 - 1) as usize + 1);
                self.depth[a..b].fill(f32::NEG_INFINITY);
                self.id[a..b].fill(-1);
            }
        }
        self.bbox = [self.w as i32, self.h as i32, -1, -1];
    }
}

pub struct Cam { pub t: [f64; 3], pub r: [f64; 3], pub u: [f64; 3], pub c: [f64; 3], pub s: f64, pub x0: f64, pub y0: f64 }

/// projectInstance: world positions → device x, y and depth (f32, as the JS Float32Array)
pub fn project(p: &[f32], cam: &Cam, out: &mut Vec<f32>) {
    let n = p.len() / 3;
    out.clear();
    out.reserve(n * 3);
    for i in 0..n {
        let dx = p[3 * i] as f64 - cam.t[0];
        let dy = p[3 * i + 1] as f64 - cam.t[1];
        let dz = p[3 * i + 2] as f64 - cam.t[2];
        out.push((cam.x0 + (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) * cam.s) as f32);
        out.push((cam.y0 - (dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) * cam.s) as f32);
        out.push((dx * cam.c[0] + dy * cam.c[1] + dz * cam.c[2]) as f32);
    }
}

#[inline] fn jmin3(a: f64, b: f64, c: f64) -> f64 { a.min(b).min(c) }
#[inline] fn jmax3(a: f64, b: f64, c: f64) -> f64 { a.max(b).max(c) }

/// rasterInstance: spans per row from the three edge functions, depth by the triangle's plane, pixel centres +0.5
pub fn raster(f: &mut Frame, s: &[f32], idx: &[u32], tri_face: &[u32], base: i32) {
    let (w, h) = (f.w as i64, f.h as i64);
    const EPS: f64 = 1e-4;
    let [mut bx0, mut by0, mut bx1, mut by1] = f.bbox.map(|v| v as i64);
    let nt = idx.len() / 3;
    for t in 0..nt {
        let (a, b, c) = (idx[3 * t] as usize * 3, idx[3 * t + 1] as usize * 3, idx[3 * t + 2] as usize * 3);
        let (x0, y0, z0) = (s[a] as f64, s[a + 1] as f64, s[a + 2] as f64);
        let (x1, y1, z1) = (s[b] as f64, s[b + 1] as f64, s[b + 2] as f64);
        let (x2, y2, z2) = (s[c] as f64, s[c + 1] as f64, s[c + 2] as f64);
        let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        if !(area.abs() > 1e-9) { continue; }
        let r0 = ((jmin3(y0, y1, y2) - 0.5 - EPS).ceil() as i64).max(0);
        let r1 = ((jmax3(y0, y1, y2) - 0.5 + EPS).floor() as i64).min(h - 1);
        let c0 = ((jmin3(x0, x1, x2) - 0.5 - EPS).ceil() as i64).max(0);
        let c1 = ((jmax3(x0, x1, x2) - 0.5 + EPS).floor() as i64).min(w - 1);
        if r0 > r1 || c0 > c1 { continue; }
        let gx = ((z1 - z0) * (y2 - y0) - (z2 - z0) * (y1 - y0)) / area;
        let gy = ((z2 - z0) * (x1 - x0) - (z1 - z0) * (x2 - x0)) / area;
        let sg = if area > 0.0 { 1.0 } else { -1.0 };
        let e = [
            (sg * (y1 - y2), sg * (x2 - x1), sg * (x1 * y2 - x2 * y1)),
            (sg * (y2 - y0), sg * (x0 - x2), sg * (x2 * y0 - x0 * y2)),
            (sg * (y0 - y1), sg * (x1 - x0), sg * (x0 * y1 - x1 * y0)),
        ];
        let fid = base + tri_face.get(t).map_or(0, |&v| v as i32);
        if c0 < bx0 { bx0 = c0; } if c1 > bx1 { bx1 = c1; } if r0 < by0 { by0 = r0; } if r1 > by1 { by1 = r1; }
        'rows: for y in r0..=r1 {
            let py = y as f64 + 0.5;
            let (mut lo, mut hi) = (c0, c1);
            for &(aa, bb, cc) in &e {
                let k = bb * py + cc;
                if aa > 0.0 { let v = (-k / aa - 0.5 - EPS).ceil() as i64; if v > lo { lo = v; } }
                else if aa < 0.0 { let v = (-k / aa - 0.5 + EPS).floor() as i64; if v < hi { hi = v; } }
                else if k < -EPS { continue 'rows; }
            }
            if lo > hi { continue; }
            let mut z = z0 + gx * (lo as f64 + 0.5 - x0) + gy * (py - y0);
            let (a, b) = (y as usize * f.w + lo as usize, y as usize * f.w + hi as usize + 1);
            // one bounds check per span: zip the row segments of both buffers
            for (d, i) in f.depth[a..b].iter_mut().zip(f.id[a..b].iter_mut()) {
                if z > *d as f64 { *d = z as f32; *i = fid; }
                z += gx;
            }
        }
    }
    f.bbox = [bx0 as i32, by0 as i32, bx1 as i32, by1 as i32];
}

/// Parameters of lineWork's sample tests.
pub struct LineParams { pub bias: f64, pub near: f64, pub shallow: f64, pub k: f64, pub step: f64 }

fn visible(f: &Frame, lp: &LineParams, x: f64, y: f64, z: f64, fa: f64, fb: f64) -> bool {
    let (w, h) = (f.w as i64, f.h as i64);
    let (px, py) = (x.floor() as i64, y.floor() as i64);
    if px < 1 || py < 1 || px >= w - 1 || py >= h - 1 { return true; }
    let o0 = (py * w + px) as usize;
    if z >= f.depth[o0] as f64 - lp.bias { return true; }
    for dy in [-w, 0, w] { for dx in [-1i64, 0, 1] {
        let q = (o0 as i64 + dy + dx) as usize;
        let id = f.id[q] as f64;
        if (id == fa || id == fb) && z >= f.depth[q] as f64 - lp.near { return true; }
    } }
    false
}
fn visible_sil(f: &Frame, lp: &LineParams, x: f64, y: f64, z: f64, nx: f64, ny: f64) -> u8 {
    let (w, h) = (f.w as i64, f.h as i64);
    let (px, py) = (x.floor() as i64, y.floor() as i64);
    if px < 2 || py < 2 || px >= w - 2 || py >= h - 2 { return 2; }
    let (qx, qy) = ((x + nx * 1.5).floor() as i64, (y + ny * 1.5).floor() as i64);
    let dq = f.depth[(qy * w + qx) as usize] as f64;
    if z >= f.depth[(py * w + px) as usize] as f64 - lp.bias || z >= dq - lp.bias {
        return if dq == f64::NEG_INFINITY { 2 } else if z - dq < lp.shallow && z - dq > -lp.bias { 3 } else { 1 };
    }
    0
}

/// classify() of lines.js for one polyline (device xyz triples). fa/fb: per-segment face ids; on: per-segment
/// outward sheet directions (silhouettes) or empty. Appends runs to `out` as [state, npts, x, y, …] (CSS px).
pub fn classify(f: &Frame, lp: &LineParams, pts: &[f32], fa: &[f64], fb: &[f64], on: &[f32], out: &mut Vec<f64>) -> usize {
    let n = pts.len() / 3;
    let (mut xs, mut ys, mut st, mut vx): (Vec<f64>, Vec<f64>, Vec<u8>, Vec<bool>) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let sil = !on.is_empty();
    for i in 0..n.saturating_sub(1) {
        let (ax, ay, az) = (pts[3 * i] as f64, pts[3 * i + 1] as f64, pts[3 * i + 2] as f64);
        let (bx, by, bz) = (pts[3 * i + 3] as f64, pts[3 * i + 4] as f64, pts[3 * i + 5] as f64);
        let l = (bx - ax).hypot(by - ay);
        let m = f64::max(1.0, (l / lp.step).ceil()) as usize;
        let (fai, fbi) = (fa.get(i).copied().unwrap_or(-1e9), fb.get(i).copied().unwrap_or(-1e9));
        for j in (if i == 0 { 0 } else { 1 })..=m {
            let t = j as f64 / m as f64;
            let (x, y, z) = (ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
            xs.push(x); ys.push(y); vx.push(j == 0 || j == m);
            st.push(if sil { visible_sil(f, lp, x, y, z, on[2 * i] as f64, on[2 * i + 1] as f64) } else { visible(f, lp, x, y, z, fai, fbi) as u8 });
        }
    }
    let nn = st.len();
    if nn < 2 { return 0; }
    for i in 1..nn - 1 { if st[i - 1] == st[i + 1] && st[i] != st[i - 1] { st[i] = st[i - 1]; } }
    let min_run = 3.0 * lp.k / lp.step;
    for _ in 0..2 {
        let mut a = 0usize;
        for i in 1..=nn {
            if i < nn && st[i] == st[a] { continue; }
            if ((i - a) as f64) < min_run && (a > 0 || i < nn) { let v = if a > 0 { st[a - 1] } else { st[i] }; for s in &mut st[a..i] { *s = v; } }
            a = i;
        }
    }
    let k = lp.k;
    let mut runs = 0;
    let mut start = 0usize;
    for i in 1..=nn {
        if i < nn && st[i] == st[start] { continue; }
        let mut run: Vec<f64> = Vec::new();
        if start > 0 { run.push((xs[start - 1] + xs[start]) / 2.0 / k); run.push((ys[start - 1] + ys[start]) / 2.0 / k); }
        else { run.push(xs[0] / k); run.push(ys[0] / k); }
        for j in start..i { if vx[j] && j > 0 && j < nn - 1 { run.push(xs[j] / k); run.push(ys[j] / k); } }
        if i < nn { run.push((xs[i - 1] + xs[i]) / 2.0 / k); run.push((ys[i - 1] + ys[i]) / 2.0 / k); }
        else { run.push(xs[nn - 1] / k); run.push(ys[nn - 1] / k); }
        if run.len() >= 4 { out.push(st[start] as f64); out.push((run.len() / 2) as f64); out.extend(run); runs += 1; }
        start = i;
    }
    runs
}

// ── frame registry ────────────────────────────────────────────────────────────
thread_local! { static FRAMES: RefCell<Vec<Option<Frame>>> = const { RefCell::new(Vec::new()) }; }
pub fn frame_new(w: usize, h: usize) -> u32 {
    FRAMES.with(|r| { let mut r = r.borrow_mut(); let f = Some(Frame::new(w, h));
        match r.iter().position(|s| s.is_none()) { Some(i) => { r[i] = f; i as u32 + 1 } None => { r.push(f); r.len() as u32 } } })
}
pub fn with_frame<R>(h: u32, f: impl FnOnce(&mut Frame) -> R) -> Option<R> {
    FRAMES.with(|r| { let mut r = r.borrow_mut(); r.get_mut((h as usize).wrapping_sub(1))?.as_mut().map(f) })
}
pub fn frame_free(h: u32) { FRAMES.with(|r| { if let Some(s) = r.borrow_mut().get_mut((h as usize).wrapping_sub(1)) { *s = None; } }) }
