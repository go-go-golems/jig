//! analyseCluster from src/engine/sketch/solver.js: rank of the Jacobian by incremental re-orthogonalised
//! Gram–Schmidt over constraint row groups (priority order), redundant groups with their implied-by coefficients,
//! free parameters (diagonal of the null-space projector) and the DOF of each entity (rank of its projector block).
use crate::linalg::{chol_solve, qrcp_rank};

pub struct RowSpace { n: usize, tol: f64, pub basis: Vec<Vec<f64>> }
fn norm(v: &[f64]) -> f64 { v.iter().map(|x| x * x).sum::<f64>().sqrt() }
impl RowSpace {
    pub fn new(n: usize, tol: f64) -> Self { RowSpace { n, tol, basis: Vec::new() } }
    fn residual(&self, v: &[f64]) -> Vec<f64> {
        let mut w = v.to_vec();
        for _ in 0..2 { for q in &self.basis {
            let d: f64 = (0..self.n).map(|i| q[i] * w[i]).sum();
            if d != 0.0 { for i in 0..self.n { w[i] -= d * q[i]; } }
        } }
        w
    }
    /// add rows; returns how many were independent
    pub fn add(&mut self, rows: &[&[f64]]) -> usize {
        let mut added = 0;
        for v in rows {
            let nv = norm(v);
            if nv < 1e-14 { continue; }
            let mut w = self.residual(v);
            let nw = norm(&w);
            if nw > self.tol * f64::max(1.0, nv) { for x in w.iter_mut() { *x /= nw; } self.basis.push(w); added += 1; }
        }
        added
    }
}

/// least squares min ‖Σ c_k a_k − v‖ over rows (normal equations, μ = 1e-12)
pub fn ls_coefficients(rows: &[&[f64]], v: &[f64], n: usize) -> Vec<f64> {
    let k = rows.len();
    if k == 0 { return Vec::new(); }
    let mut ata = vec![0.0; k * k];
    let mut atv = vec![0.0; k];
    for a in 0..k {
        for b in 0..k { ata[a * k + b] = (0..n).map(|i| rows[a][i] * rows[b][i]).sum(); }
        atv[a] = (0..n).map(|i| rows[a][i] * v[i]).sum();
    }
    chol_solve(&ata, k, &atv, 1e-12).unwrap_or_else(|| vec![0.0; k])
}

/// J: m × n row-major in priority order; groups: rows per constraint; ents: column sets per entity.
/// Result layout: [rank, for each group: added, ncoef, coef…] then free (n) then entity DOF (one per entity).
pub fn analyse(j: &[f64], m: usize, n: usize, groups: &[usize], ents: &[Vec<usize>]) -> Vec<f64> {
    let mut rs = RowSpace::new(n, 1e-8);
    let mut out = vec![0.0];
    let mut row = 0;
    for &g in groups {
        let rows: Vec<&[f64]> = (0..g).map(|k| &j[(row + k) * n..(row + k + 1) * n]).collect();
        let added = rs.add(&rows);
        out.push(added as f64);
        if added < g && added == 0 && g > 0 {
            let prev: Vec<&[f64]> = (0..row).map(|r| &j[r * n..(r + 1) * n]).collect();
            let coef = ls_coefficients(&prev, rows[0], n);
            out.push(coef.len() as f64);
            out.extend(coef);
        } else { out.push(0.0); }
        row += g;
    }
    debug_assert!(row <= m);
    out[0] = rs.basis.len() as f64;
    for k in 0..n { let mut f = 1.0; for q in &rs.basis { f -= q[k] * q[k]; } out.push(f); }
    for s in ents {
        if s.is_empty() { out.push(0.0); continue; }
        let d = s.len();
        let mut p = vec![0.0; d * d];
        for a in 0..d { for b in 0..d {
            let mut v = if a == b { 1.0 } else { 0.0 };
            for q in &rs.basis { v -= q[s[a]] * q[s[b]]; }
            p[a * d + b] = v;
        } }
        out.push(qrcp_rank(&p, d, d, 1e-7) as f64);
    }
    out
}
