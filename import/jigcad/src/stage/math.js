// math.js: the few vector, matrix and number helpers the stage needs. World units are millimetres, +Z is up.

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const isIdentity = m => !m || m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-12);

// column-major 4×4 (the ProgramData convention): p' = M p
export function applyM(m, p) {
  if (!m) return p;
  const [x, y, z] = p;
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
export const applyDir = (m, d) => !m ? d : [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];

// transform a packed xyz array (Float32Array) into a new Float32Array
export function transformPoints(m, src) {
  const n = src.length, out = new Float32Array(n);
  if (isIdentity(m)) { out.set(src); return out; }
  for (let i = 0; i < n; i += 3) {
    const x = src[i], y = src[i + 1], z = src[i + 2];
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
}
export function mulM(a, b) {      // a · b, column-major
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
export const translateM = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

// a box [[x0, y0, z0], [x1, y1, z1]]
export const emptyBox = () => [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
export function growBox(b, p) {
  for (let k = 0; k < 3; k++) { if (p[k] < b[0][k]) b[0][k] = p[k]; if (p[k] > b[1][k]) b[1][k] = p[k]; }
  return b;
}
export function boxOfPoints(arr, b = emptyBox()) {
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    if (x < b[0][0]) b[0][0] = x; if (x > b[1][0]) b[1][0] = x;
    if (y < b[0][1]) b[0][1] = y; if (y > b[1][1]) b[1][1] = y;
    if (z < b[0][2]) b[0][2] = z; if (z > b[1][2]) b[1][2] = z;
  }
  return b;
}
export const boxOk = b => b && isFinite(b[0][0]) && isFinite(b[1][0]);
export const boxCorners = b => {
  const out = [];
  for (let i = 0; i < 8; i++) out.push([b[i & 1][0], b[(i >> 1) & 1][1], b[(i >> 2) & 1][2]]);
  return out;
};
export const boxCentre = b => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
export const boxSize = b => [b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]];

// 1, 2, 5 × 10^k: the nice number nearest to x (in log terms)
export function nice(x) {
  if (!(x > 0)) return 1;
  const e = Math.floor(Math.log10(x)), f = x / 10 ** e;
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return m * 10 ** e;
}
// the largest 1, 2, 5 × 10^k not above x
export function niceFloor(x) {
  if (!(x > 0)) return 1;
  const e = Math.floor(Math.log10(x)), f = x / 10 ** e;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * 10 ** e;
}

// numbers on the sheet carry units; whole millimetres stay whole, anything else gets two decimals
export function fmtNum(v, dp = 2) {
  if (!isFinite(v)) return '–';
  const r = Math.round(v);
  if (Math.abs(v - r) < 0.005) return String(r).replace('-', '−');
  return v.toFixed(dp).replace('-', '−');
}
export const fmtMM = v => fmtNum(v) + ' mm';
export const fmtDeg = rad => fmtNum(rad / DEG, 1) + '°';
export function fmtVolume(mm3) {
  if (!isFinite(mm3)) return '–';
  const cm3 = mm3 / 1000;
  return (cm3 >= 1000 ? cm3.toFixed(0) : cm3.toFixed(1)) + ' cm³';
}
