//! [f64; 3] helpers mirroring `V` in src/engine/kernel.js (same operation order, no allocation).
pub type V3 = [f64; 3];

#[inline] pub fn add(a: V3, b: V3) -> V3 { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
#[inline] pub fn sub(a: V3, b: V3) -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
#[inline] pub fn mul(a: V3, k: f64) -> V3 { [a[0] * k, a[1] * k, a[2] * k] }
#[inline] pub fn dot(a: V3, b: V3) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
#[inline] pub fn cross(a: V3, b: V3) -> V3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
#[inline] pub fn neg(a: V3) -> V3 { [-a[0], -a[1], -a[2]] }

/// Math.hypot(x, y, z): scaled to avoid overflow and underflow, like V8.
#[inline]
pub fn hypot3(x: f64, y: f64, z: f64) -> f64 {
    let (ax, ay, az) = (x.abs(), y.abs(), z.abs());
    let m = ax.max(ay).max(az);
    if m == 0.0 || !m.is_finite() { return if m.is_nan() { f64::NAN } else { m }; }
    let (sx, sy, sz) = (ax / m, ay / m, az / m);
    (sx * sx + sy * sy + sz * sz).sqrt() * m
}
#[inline] pub fn len(a: V3) -> f64 { hypot3(a[0], a[1], a[2]) }
/// V.unit: a zero vector stays zero (length treated as 1).
#[inline]
pub fn unit(a: V3) -> V3 {
    let mut l = len(a);
    if l == 0.0 || l.is_nan() { l = 1.0; }
    [a[0] / l, a[1] / l, a[2] / l]
}
/// K.matApply: column-major 4×4 applied to a point.
#[inline]
pub fn mat_apply(m: &[f64; 16], p: V3) -> V3 {
    [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]
}
pub const IDENTITY: [f64; 16] = [1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1.];
