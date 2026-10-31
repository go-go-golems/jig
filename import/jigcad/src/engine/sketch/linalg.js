// linalg.js · small dense linear algebra for the sketch solver (row-major Float64Array).
// qrcp: Householder QR with column pivoting (rank-revealing), full Q on request.
// minNormSolve: minimum-norm solution of J h = b via QR of Jᵀ (handles rank deficiency and redundancy).

export function qrcp(A, m, n, { wantQ = false, tol = 1e-10 } = {}) {
  const R = Float64Array.from(A);
  const perm = Array.from({ length: n }, (_, i) => i);
  const Q = wantQ ? identity(m) : null;
  const k = Math.min(m, n);
  const diag = [];
  let maxDiag = 0, rank = 0;
  const v = new Float64Array(m);
  for (let j = 0; j < k; j++) {
    // pivot: largest remaining column norm
    let best = -1, bestN = -1;
    for (let c = j; c < n; c++) {
      let s = 0;
      for (let i = j; i < m; i++) { const x = R[i * n + c]; s += x * x; }
      if (s > bestN) { bestN = s; best = c; }
    }
    if (best !== j) {
      for (let i = 0; i < m; i++) { const t = R[i * n + j]; R[i * n + j] = R[i * n + best]; R[i * n + best] = t; }
      const t = perm[j]; perm[j] = perm[best]; perm[best] = t;
    }
    const normx = Math.sqrt(bestN);
    if (j === 0) maxDiag = normx;
    if (normx <= tol * Math.max(1, maxDiag) || normx < 1e-300) { diag.push(0); break; }
    const x0 = R[j * n + j];
    const alpha = x0 > 0 ? -normx : normx;
    let vn = 0;
    for (let i = j; i < m; i++) { v[i] = R[i * n + j]; }
    v[j] -= alpha;
    for (let i = j; i < m; i++) vn += v[i] * v[i];
    if (vn > 1e-300) {
      for (let c = j; c < n; c++) {
        let s = 0;
        for (let i = j; i < m; i++) s += v[i] * R[i * n + c];
        s = (2 * s) / vn;
        for (let i = j; i < m; i++) R[i * n + c] -= s * v[i];
      }
      if (Q) {
        // Q ← Q · H  (H = I − 2vvᵀ/vn acting on rows j..m-1)
        for (let r = 0; r < m; r++) {
          let s = 0;
          for (let i = j; i < m; i++) s += Q[r * m + i] * v[i];
          s = (2 * s) / vn;
          for (let i = j; i < m; i++) Q[r * m + i] -= s * v[i];
        }
      }
    }
    for (let i = j + 1; i < m; i++) R[i * n + j] = 0;
    diag.push(Math.abs(R[j * n + j]));
    rank++;
  }
  return { R, Q, perm, rank, diag, m, n };
}

export function identity(n) { const I = new Float64Array(n * n); for (let i = 0; i < n; i++) I[i * n + i] = 1; return I; }

export function transpose(A, m, n) {
  const T = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) T[j * m + i] = A[i * n + j];
  return T;
}

// Householder QR with column pivoting on a list of columns (each a Float64Array of length m), in place.
// Returns reflectors so Q can be applied lazily; column norms are downdated (recomputed on cancellation).
export function qrColumns(cols, m, tol = 1e-10) {
  const n = cols.length, perm = Array.from({ length: n }, (_, i) => i);
  const norms = cols.map(c => { let s = 0; for (let i = 0; i < m; i++) s += c[i] * c[i]; return s; });
  const orig = norms.slice();
  const refl = [];
  let rank = 0, maxDiag = 0;
  const k = Math.min(m, n);
  for (let j = 0; j < k; j++) {
    let best = j;
    for (let c = j + 1; c < n; c++) if (norms[c] > norms[best]) best = c;
    if (best !== j) {
      [cols[j], cols[best]] = [cols[best], cols[j]]; [perm[j], perm[best]] = [perm[best], perm[j]];
      [norms[j], norms[best]] = [norms[best], norms[j]]; [orig[j], orig[best]] = [orig[best], orig[j]];
    }
    const col = cols[j];
    let nx = 0; for (let i = j; i < m; i++) nx += col[i] * col[i];
    nx = Math.sqrt(nx);
    if (j === 0) maxDiag = nx;
    if (nx <= tol * Math.max(1, maxDiag) || nx < 1e-300) break;
    const alpha = col[j] > 0 ? -nx : nx;
    const v = new Float64Array(m);
    for (let i = j; i < m; i++) v[i] = col[i];
    v[j] -= alpha;
    let vn = 0; for (let i = j; i < m; i++) vn += v[i] * v[i];
    col[j] = alpha; for (let i = j + 1; i < m; i++) col[i] = 0;
    if (vn > 1e-300) {
      for (let c = j + 1; c < n; c++) {
        const cc = cols[c];
        let d = 0; for (let i = j; i < m; i++) d += v[i] * cc[i];
        d = (2 * d) / vn;
        if (d) for (let i = j; i < m; i++) cc[i] -= d * v[i];
        norms[c] -= cc[j] * cc[j];
        if (norms[c] < 1e-6 * orig[c]) { let t = 0; for (let i = j + 1; i < m; i++) t += cc[i] * cc[i]; norms[c] = t; orig[c] = Math.max(t, 1e-300); }
      }
    }
    refl.push({ j, v, vn });
    rank++;
  }
  // y ← Q y (Q = H0 H1 … H(r−1))
  const applyQ = y => { for (let t = refl.length - 1; t >= 0; t--) reflect(refl[t], y, m); return y; };
  const applyQt = y => { for (let t = 0; t < refl.length; t++) reflect(refl[t], y, m); return y; };
  return { cols, perm, rank, refl, applyQ, applyQt };
}
function reflect({ j, v, vn }, y, m) {
  if (vn <= 1e-300) return;
  let d = 0; for (let i = j; i < m; i++) d += v[i] * y[i];
  d = (2 * d) / vn;
  if (d) for (let i = j; i < m; i++) y[i] -= d * v[i];
}

// Factor J (m × n) through QR of Jᵀ: { rank, solve(b) → minimum-norm h with J h ≈ b, nullBasis, rowBasis (lazy) }
export function factorJ(J, m, n, tol = 1e-10) {
  if (m === 0) {
    return { rank: 0, rowBasis: [], get nullBasis() { return Array.from({ length: n }, (_, i) => { const e = new Float64Array(n); e[i] = 1; return e; }); }, solve: () => new Float64Array(n) };
  }
  const cols = Array.from({ length: m }, (_, i) => Float64Array.from(J.subarray(i * n, (i + 1) * n)));   // columns of Jᵀ = rows of J
  const f = qrColumns(cols, n, tol);
  const { perm, rank } = f;
  const solve = b => {
    const y = new Float64Array(n);
    for (let k = 0; k < rank; k++) {
      let s2 = b[perm[k]];
      const ck = f.cols[k];
      for (let i = 0; i < k; i++) s2 -= ck[i] * y[i];
      y[k] = s2 / ck[k];
    }
    return f.applyQ(y);
  };
  const unit = c => { const e = new Float64Array(n); e[c] = 1; return f.applyQ(e); };
  let nb = null, rb = null;
  return {
    rank, solve,
    get nullBasis() { return nb ??= Array.from({ length: n - rank }, (_, c) => unit(rank + c)); },
    get rowBasis() { return rb ??= Array.from({ length: rank }, (_, c) => unit(c)); },
  };
}

// Cholesky solve of (A + μI) x = b for symmetric positive (semi)definite A (n × n)
export function cholSolve(A, n, b, mu = 0) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j] + (i === j ? mu : 0);
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 1e-300) return null;
        L[i * n + i] = Math.sqrt(s);
      } else L[i * n + j] = s / L[j * n + j];
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

// Incremental orthonormal basis of a row space (modified Gram–Schmidt, re-orthogonalised).
export class RowSpace {
  constructor(n, tol = 1e-8) { this.n = n; this.basis = []; this.tol = tol; }
  residual(v) {
    const w = Float64Array.from(v);
    for (let pass = 0; pass < 2; pass++) for (const q of this.basis) {
      let d = 0; for (let i = 0; i < this.n; i++) d += q[i] * w[i];
      if (d) for (let i = 0; i < this.n; i++) w[i] -= d * q[i];
    }
    return w;
  }
  // try to add rows; returns how many were independent
  add(rows) {
    let added = 0;
    for (const v of rows) {
      const nv = norm(v);
      if (nv < 1e-14) continue;
      const w = this.residual(v);
      const nw = norm(w);
      if (nw > this.tol * Math.max(1, nv)) { for (let i = 0; i < this.n; i++) w[i] /= nw; this.basis.push(w); added++; }
    }
    return added;
  }
  // rank increase the rows would bring, without adding them
  probe(rows) {
    const save = this.basis.length;
    const k = this.add(rows);
    this.basis.length = save;
    return k;
  }
  get rank() { return this.basis.length; }
}
export const norm = v => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); };
export const normInf = v => { let s = 0; for (let i = 0; i < v.length; i++) s = Math.max(s, Math.abs(v[i])); return s; };

// least squares min ‖Σ c_k a_k − v‖ over the given rows a_k; returns coefficients (min norm)
export function lsCoefficients(rows, v, n) {
  const k = rows.length;
  if (!k) return [];
  const AtA = new Float64Array(k * k), Atv = new Float64Array(k);
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < k; b++) { let s = 0; for (let i = 0; i < n; i++) s += rows[a][i] * rows[b][i]; AtA[a * k + b] = s; }
    let s = 0; for (let i = 0; i < n; i++) s += rows[a][i] * v[i]; Atv[a] = s;
  }
  return Array.from(cholSolve(AtA, k, Atv, 1e-12) ?? new Float64Array(k));
}
