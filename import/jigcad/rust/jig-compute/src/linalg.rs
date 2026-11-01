//! Dense linear algebra of the sketch solver, ported from src/engine/sketch/linalg.js (row-major).

/// Householder QR with column pivoting; returns the numerical rank (what solver.js reads from qrcp).
pub fn qrcp_rank(a: &[f64], m: usize, n: usize, tol: f64) -> usize {
    let mut r = a.to_vec();
    let k = m.min(n);
    let mut max_diag = 0.0;
    let mut rank = 0;
    let mut v = vec![0.0; m];
    for j in 0..k {
        let (mut best, mut best_n) = (usize::MAX, -1.0);
        for c in j..n {
            let mut s = 0.0;
            for i in j..m { let x = r[i * n + c]; s += x * x; }
            if s > best_n { best_n = s; best = c; }
        }
        if best != j { for i in 0..m { r.swap(i * n + j, i * n + best); } }
        let normx = best_n.sqrt();
        if j == 0 { max_diag = normx; }
        if normx <= tol * f64::max(1.0, max_diag) || normx < 1e-300 { break; }
        let x0 = r[j * n + j];
        let alpha = if x0 > 0.0 { -normx } else { normx };
        for i in j..m { v[i] = r[i * n + j]; }
        v[j] -= alpha;
        let mut vn = 0.0;
        for i in j..m { vn += v[i] * v[i]; }
        if vn > 1e-300 {
            for c in j..n {
                let mut s = 0.0;
                for i in j..m { s += v[i] * r[i * n + c]; }
                let s = (2.0 * s) / vn;
                for i in j..m { r[i * n + c] -= s * v[i]; }
            }
        }
        for i in j + 1..m { r[i * n + j] = 0.0; }
        rank += 1;
    }
    rank
}

struct Refl { j: usize, v: Vec<f64>, vn: f64 }
fn reflect(rf: &Refl, y: &mut [f64], m: usize) {
    if rf.vn <= 1e-300 { return; }
    let mut d = 0.0;
    for i in rf.j..m { d += rf.v[i] * y[i]; }
    let d = (2.0 * d) / rf.vn;
    if d != 0.0 { for i in rf.j..m { y[i] -= d * rf.v[i]; } }
}

/// factorJ: QR of Jᵀ (columns = rows of J). solve(b) is the minimum-norm h with J h ≈ b; null basis on request.
pub struct FactorJ { pub rank: usize, n: usize, cols: Vec<Vec<f64>>, perm: Vec<usize>, refl: Vec<Refl> }

impl FactorJ {
    pub fn new(jm: &[f64], m: usize, n: usize, tol: f64) -> FactorJ {
        let mut cols: Vec<Vec<f64>> = (0..m).map(|i| jm[i * n..(i + 1) * n].to_vec()).collect();
        let cn = cols.len();
        let mut perm: Vec<usize> = (0..cn).collect();
        let mut norms: Vec<f64> = cols.iter().map(|c| c.iter().map(|x| x * x).sum()).collect();
        let mut orig = norms.clone();
        let mut refl = Vec::new();
        let (mut rank, mut max_diag) = (0, 0.0);
        let k = n.min(cn);
        let mm = n; // length of each column
        for j in 0..k {
            let mut best = j;
            for c in j + 1..cn { if norms[c] > norms[best] { best = c; } }
            if best != j { cols.swap(j, best); perm.swap(j, best); norms.swap(j, best); orig.swap(j, best); }
            let mut nx = 0.0;
            for i in j..mm { nx += cols[j][i] * cols[j][i]; }
            let nx = f64::sqrt(nx);
            if j == 0 { max_diag = nx; }
            if nx <= tol * f64::max(1.0, max_diag) || nx < 1e-300 { break; }
            let alpha = if cols[j][j] > 0.0 { -nx } else { nx };
            let mut v = vec![0.0; mm];
            for i in j..mm { v[i] = cols[j][i]; }
            v[j] -= alpha;
            let mut vn = 0.0;
            for i in j..mm { vn += v[i] * v[i]; }
            cols[j][j] = alpha;
            for i in j + 1..mm { cols[j][i] = 0.0; }
            if vn > 1e-300 {
                for c in j + 1..cn {
                    let cc = &mut cols[c];
                    let mut d = 0.0;
                    for i in j..mm { d += v[i] * cc[i]; }
                    let d = (2.0 * d) / vn;
                    if d != 0.0 { for i in j..mm { cc[i] -= d * v[i]; } }
                    norms[c] -= cc[j] * cc[j];
                    if norms[c] < 1e-6 * orig[c] {
                        let mut t = 0.0;
                        for i in j + 1..mm { t += cc[i] * cc[i]; }
                        norms[c] = t; orig[c] = f64::max(t, 1e-300);
                    }
                }
            }
            refl.push(Refl { j, v, vn });
            rank += 1;
        }
        FactorJ { rank, n, cols, perm, refl }
    }
    fn apply_q(&self, y: &mut [f64]) { for t in (0..self.refl.len()).rev() { reflect(&self.refl[t], y, self.n); } }
    pub fn solve(&self, b: &[f64]) -> Vec<f64> {
        let mut y = vec![0.0; self.n];
        for k in 0..self.rank {
            let mut s2 = b[self.perm[k]];
            let ck = &self.cols[k];
            for i in 0..k { s2 -= ck[i] * y[i]; }
            y[k] = s2 / ck[k];
        }
        self.apply_q(&mut y);
        y
    }
    pub fn null_basis(&self) -> Vec<Vec<f64>> {
        (self.rank..self.n).map(|c| { let mut e = vec![0.0; self.n]; e[c] = 1.0; self.apply_q(&mut e); e }).collect()
    }
}

/// Cholesky solve of (A + μI) x = b; None when not positive definite.
pub fn chol_solve(a: &[f64], n: usize, b: &[f64], mu: f64) -> Option<Vec<f64>> {
    let mut l = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..=i {
            let mut s = a[i * n + j] + if i == j { mu } else { 0.0 };
            for k in 0..j { s -= l[i * n + k] * l[j * n + k]; }
            if i == j {
                if s <= 1e-300 { return None; }
                l[i * n + i] = s.sqrt();
            } else { l[i * n + j] = s / l[j * n + j]; }
        }
    }
    let mut y = vec![0.0; n];
    for i in 0..n { let mut s = b[i]; for k in 0..i { s -= l[i * n + k] * y[k]; } y[i] = s / l[i * n + i]; }
    let mut x = vec![0.0; n];
    for i in (0..n).rev() { let mut s = y[i]; for k in i + 1..n { s -= l[k * n + i] * x[k]; } x[i] = s / l[i * n + i]; }
    Some(x)
}
