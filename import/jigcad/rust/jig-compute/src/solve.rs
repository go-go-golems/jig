//! The sketch solver's loops on a residual tape: dog-leg, Levenberg–Marquardt, Newton, strategy fallback and the
//! least-change drag. Literal ports of src/engine/sketch/solver.js (same constants, same acceptance rules); the
//! only intended difference is the Jacobian, which is exact (reverse mode) instead of 4-point finite differences.
use crate::linalg::{chol_solve, FactorJ};
use crate::tape::Tape;

const TOL_F: f64 = 1e-10;
pub const FEASIBLE: f64 = 1e-8;

/// A cluster problem: the equations `eqs` of `tape` over the columns `cols` of the full parameter vector `x`.
pub struct Problem<'a> {
    tape: &'a Tape,
    pub x: Vec<f64>,
    pub cols: Vec<usize>,
    eqs: Vec<usize>,
    col_of: Vec<i32>,
    val: Vec<f64>,
    adj: Vec<f64>,
}

impl<'a> Problem<'a> {
    pub fn new(tape: &'a Tape, x: Vec<f64>, cols: Vec<usize>, eqs: Vec<usize>) -> Problem<'a> {
        let mut col_of = vec![-1i32; x.len()];
        for (k, &c) in cols.iter().enumerate() { if c < col_of.len() { col_of[c] = k as i32; } }
        Problem { tape, x, cols, eqs, col_of, val: Vec::new(), adj: Vec::new() }
    }
    pub fn n(&self) -> usize { self.cols.len() }
    pub fn m(&self) -> usize { self.eqs.len() }
    pub fn set(&mut self, xc: &[f64]) { for (k, &c) in self.cols.iter().enumerate() { self.x[c] = xc[k]; } }
    pub fn get(&self) -> Vec<f64> { self.cols.iter().map(|&c| self.x[c]).collect() }
    pub fn res(&mut self, xc: &[f64]) -> Vec<f64> {
        self.set(xc);
        let mut r = Vec::with_capacity(self.m());
        for i in 0..self.eqs.len() { let e = self.eqs[i]; r.push(self.tape.eval(e, &self.x, &mut self.val)); }
        r
    }
    pub fn jac(&mut self, xc: &[f64]) -> Vec<f64> {
        self.set(xc);
        let (m, n) = (self.m(), self.n());
        let mut j = vec![0.0; m * n];
        for i in 0..m {
            let e = self.eqs[i];
            self.tape.grad(e, &self.x, &self.col_of, &mut j[i * n..(i + 1) * n], &mut self.val, &mut self.adj);
        }
        j
    }
    /// gradient of one extra tape equation (e.g. a dragged point's coordinate) over the columns, and its value
    pub fn grad_of(&mut self, e: usize) -> (f64, Vec<f64>) {
        let mut row = vec![0.0; self.n()];
        let v = self.tape.grad(e, &self.x, &self.col_of, &mut row, &mut self.val, &mut self.adj);
        (v, row)
    }
}

fn norm(v: &[f64]) -> f64 { v.iter().map(|x| x * x).sum::<f64>().sqrt() }
fn norm_inf(v: &[f64]) -> f64 { v.iter().fold(0.0, |s, x| f64::max(s, x.abs())) }
fn half2(r: &[f64]) -> f64 { r.iter().map(|x| x * x).sum::<f64>() / 2.0 }
fn mat_vec(j: &[f64], m: usize, n: usize, v: &[f64]) -> Vec<f64> { (0..m).map(|i| (0..n).map(|k| j[i * n + k] * v[k]).sum()).collect() }
fn mat_t_vec(j: &[f64], m: usize, n: usize, v: &[f64]) -> Vec<f64> {
    let mut o = vec![0.0; n];
    for i in 0..m { let vi = v[i]; if vi != 0.0 { for k in 0..n { o[k] += j[i * n + k] * vi; } } }
    o
}

#[derive(Debug, Clone)]
pub struct Out { pub x: Vec<f64>, pub iters: usize, pub converged: bool, pub residual: f64 }

pub fn dogleg(f: &mut Problem, x0: &[f64], max_iter: usize) -> Out {
    let mut x = x0.to_vec();
    let mut r = f.res(&x);
    let mut fv = half2(&r);
    let mut delta = f64::max(1.0, 0.25 * norm_inf(&x));
    let (m, n) = (f.m(), f.n());
    if m == 0 { return Out { x, iters: 0, converged: true, residual: 0.0 }; }
    let (mut stall, mut inconsistent) = (0, 0);
    let mut hist: Vec<f64> = Vec::new();
    let mut it = 0;
    while it < max_iter && norm_inf(&r) > TOL_F {
        let f_prev = fv;
        let j = f.jac(&x);
        let g = mat_t_vec(&j, m, n, &r);
        if norm_inf(&g) < 1e-15 { break; }
        let fac = FactorJ::new(&j, m, n, 1e-10);
        let neg_r: Vec<f64> = r.iter().map(|v| -v).collect();
        let hgn = fac.solve(&neg_r);
        if fac.rank < m {
            let jh0 = mat_vec(&j, m, n, &hgn);
            let lin: Vec<f64> = r.iter().zip(&jh0).map(|(a, b)| a + b).collect();
            if norm(&lin) > 0.5 * norm(&r) { inconsistent += 1; if inconsistent >= 3 { break; } } else { inconsistent = 0; }
        }
        hist.push(fv);
        if hist.len() > 10 && fv > 0.99 * hist[hist.len() - 11] { break; }
        let jg = mat_vec(&j, m, n, &g);
        let alpha = norm(&g).powi(2) / f64::max(1e-300, norm(&jg).powi(2));
        let mut accepted = false;
        let mut tries = 0;
        while tries < 30 && !accepted {
            tries += 1;
            let ngn = norm(&hgn);
            let h: Vec<f64> = if ngn <= delta { hgn.clone() }
            else if alpha * norm(&g) >= delta { let ng = norm(&g); g.iter().map(|v| (-delta / ng) * v).collect() }
            else {
                let a: Vec<f64> = g.iter().map(|v| -alpha * v).collect();
                let d: Vec<f64> = hgn.iter().zip(&a).map(|(v, ak)| v - ak).collect();
                let aa = norm(&a).powi(2); let dd = norm(&d).powi(2);
                let ad: f64 = a.iter().zip(&d).map(|(p, q)| p * q).sum();
                let beta = (-ad + f64::max(0.0, ad * ad + dd * (delta * delta - aa)).sqrt()) / f64::max(1e-300, dd);
                a.iter().zip(&d).map(|(p, q)| p + beta * q).collect()
            };
            let xn: Vec<f64> = x.iter().zip(&h).map(|(v, hk)| v + hk).collect();
            let rn = f.res(&xn);
            let fnv = half2(&rn);
            let jh = mat_vec(&j, m, n, &h);
            let lin: Vec<f64> = r.iter().zip(&jh).map(|(a, b)| a + b).collect();
            let pred = fv - half2(&lin);
            let rho = if pred > 0.0 { (fv - fnv) / pred } else { -1.0 };
            if fnv < fv { x = xn; r = rn; fv = fnv; accepted = true; }
            if rho > 0.75 { delta = f64::max(delta, 3.0 * norm(&h)); } else if rho < 0.25 { delta /= 2.0; }
            if !accepted && delta < 1e-14 * (1.0 + norm(&x)) { break; }
        }
        if !accepted { break; }
        if f_prev - fv < 1e-9 * f_prev && fv > TOL_F * TOL_F { stall += 1; if stall >= 3 { break; } } else { stall = 0; }
        it += 1;
    }
    f.set(&x);
    let residual = norm_inf(&r);
    Out { x, iters: it, converged: residual <= TOL_F * 10.0, residual }
}

fn normal(j: &[f64], m: usize, n: usize) -> Vec<f64> {
    let mut a = vec![0.0; n * n];
    for i in 0..m { for p in 0..n { let jp = j[i * n + p]; if jp != 0.0 { for q in 0..n { a[p * n + q] += jp * j[i * n + q]; } } } }
    a
}

pub fn levenberg_marquardt(f: &mut Problem, x0: &[f64], max_iter: usize, tau: f64) -> Out {
    let mut x = x0.to_vec();
    let mut r = f.res(&x);
    let mut fv = half2(&r);
    let (m, n) = (f.m(), f.n());
    if m == 0 { return Out { x, iters: 0, converged: true, residual: 0.0 }; }
    let mut j = f.jac(&x);
    let mut a = normal(&j, m, n);
    let mut g = mat_t_vec(&j, m, n, &r);
    let mut maxd = 1e-12; for k in 0..n { maxd = f64::max(maxd, a[k * n + k]); }
    let mut mu = tau * maxd;
    let mut nu = 2.0;
    let mut stall = 0;
    let mut it = 0;
    while it < max_iter && norm_inf(&r) > TOL_F {
        let neg_g: Vec<f64> = g.iter().map(|v| -v).collect();
        let Some(h) = chol_solve(&a, n, &neg_g, mu) else { mu *= nu; nu *= 2.0; it += 1; continue; };
        if norm(&h) < 1e-15 * (norm(&x) + 1e-15) { break; }
        let xn: Vec<f64> = x.iter().zip(&h).map(|(v, hk)| v + hk).collect();
        let rn = f.res(&xn);
        let fnv = half2(&rn);
        let pred: f64 = 0.5 * h.iter().zip(&g).map(|(v, gk)| v * (mu * v - gk)).sum::<f64>();
        let rho = if pred > 0.0 { (fv - fnv) / pred } else { -1.0 };
        if rho > 0.0 {
            let stalled = fv - fnv < 1e-9 * fv && fnv > TOL_F * TOL_F;
            x = xn; r = rn; fv = fnv;
            if stalled { stall += 1; if stall >= 3 { break; } } else { stall = 0; }
            j = f.jac(&x); a = normal(&j, m, n); g = mat_t_vec(&j, m, n, &r);
            mu *= f64::max(1.0 / 3.0, 1.0 - (2.0 * rho - 1.0).powi(3));
            nu = 2.0;
            if norm_inf(&g) < 1e-16 { break; }
        } else { mu *= nu; nu *= 2.0; if mu > 1e20 { break; } }
        it += 1;
    }
    f.set(&x);
    let residual = norm_inf(&r);
    Out { x, iters: it, converged: residual <= TOL_F * 10.0, residual }
}

pub fn newton(f: &mut Problem, x0: &[f64], max_iter: usize) -> Out {
    let mut x = x0.to_vec();
    let mut r = f.res(&x);
    let mut fv = half2(&r);
    let (m, n) = (f.m(), f.n());
    let mut it = 0;
    while it < max_iter && norm_inf(&r) > TOL_F {
        let j = f.jac(&x);
        let neg_r: Vec<f64> = r.iter().map(|v| -v).collect();
        let h = if m == 0 { vec![0.0; n] } else { FactorJ::new(&j, m, n, 1e-10).solve(&neg_r) };
        let (mut t, mut ok) = (1.0, false);
        for _ in 0..12 {
            let xn: Vec<f64> = x.iter().zip(&h).map(|(v, hk)| v + t * hk).collect();
            let rn = f.res(&xn);
            let fnv = half2(&rn);
            if fnv < fv { x = xn; r = rn; fv = fnv; ok = true; break; }
            t /= 2.0;
        }
        if !ok { break; }
        it += 1;
    }
    f.set(&x);
    let residual = norm_inf(&r);
    Out { x, iters: it, converged: residual <= TOL_F * 10.0, residual }
}

/// 0 dogleg · 1 lm (also 'bfgs') · 2 newton
pub fn run_method(f: &mut Problem, x0: &[f64], method: i32, max_iter: i32, tau: f64) -> Out {
    let mi = |d: usize| if max_iter > 0 { max_iter as usize } else { d };
    match method {
        1 => levenberg_marquardt(f, x0, mi(200), tau),
        2 => newton(f, x0, mi(50)),
        _ => dogleg(f, x0, mi(100)),
    }
}

/// runStrategy: the method, then the fallback when it did not converge. Returns (out, used, fellBack).
pub fn run_strategy(f: &mut Problem, x0: &[f64], method: i32, fallback: i32, max_iter: i32, tau: f64) -> (Out, i32, bool) {
    let mut out = run_method(f, x0, method, max_iter, tau);
    let (mut used, mut fell) = (method, false);
    if !out.converged && fallback >= 0 && fallback != method {
        let r0 = norm_inf(&f.res(x0));
        let start = if out.residual < r0 { out.x.clone() } else { x0.to_vec() };
        let alt = run_method(f, &start, fallback, max_iter, tau);
        if alt.converged || alt.residual < out.residual { out = alt; used = fallback; fell = true; }
    }
    f.set(&out.x);
    (out, used, fell)
}

/// dragCluster: least-change motion of the point (hx, hy) toward target, then a dog-leg polish.
pub fn drag(f: &mut Problem, hx: usize, hy: usize, target: [f64; 2], max_iter: usize) -> (usize, Out) {
    let (m, n) = (f.m(), f.n());
    let mut x = f.get();
    let mut it = 0;
    while it < max_iter {
        f.set(&x);
        let r = f.res(&x);
        let j = if m > 0 { f.jac(&x) } else { Vec::new() };
        let fac = FactorJ::new(&j, m, n, 1e-10);
        let neg_r: Vec<f64> = r.iter().map(|v| -v).collect();
        let h0 = if m == 0 { vec![0.0; n] } else { fac.solve(&neg_r) };
        let (px, dx) = f.grad_of(hx);
        let (py, dy) = f.grad_of(hy);
        let e = [px - target[0], py - target[1]];
        let nb = fac.null_basis();
        let k = nb.len();
        let mut h = h0.clone();
        if k > 0 {
            let mut mm = vec![0.0; 2 * k];
            for jj in 0..k {
                mm[jj] = (0..n).map(|t| dx[t] * nb[jj][t]).sum();
                mm[k + jj] = (0..n).map(|t| dy[t] * nb[jj][t]).sum();
            }
            let dh0 = [(0..n).map(|t| dx[t] * h0[t]).sum::<f64>(), (0..n).map(|t| dy[t] * h0[t]).sum::<f64>()];
            let rhs = [-(e[0] + dh0[0]), -(e[1] + dh0[1])];
            let g00: f64 = mm[..k].iter().map(|v| v * v).sum();
            let g11: f64 = mm[k..].iter().map(|v| v * v).sum();
            let g01: f64 = (0..k).map(|jj| mm[jj] * mm[k + jj]).sum();
            let tr = g00 + g11; let det = g00 * g11 - g01 * g01;
            let w = if tr > 1e-24 && det > 1e-12 * tr * tr { [(g11 * rhs[0] - g01 * rhs[1]) / det, (g00 * rhs[1] - g01 * rhs[0]) / det] }
                else if tr > 1e-24 { [(g00 * rhs[0] + g01 * rhs[1]) / (tr * tr), (g01 * rhs[0] + g11 * rhs[1]) / (tr * tr)] }
                else { [0.0, 0.0] };
            for jj in 0..k {
                let z = mm[jj] * w[0] + mm[k + jj] * w[1];
                if z != 0.0 { for t in 0..n { h[t] += z * nb[jj][t]; } }
            }
        }
        let step = norm(&h);
        let cap = f64::max(5.0, 2.0 * e[0].hypot(e[1]));
        if step > cap { for v in h.iter_mut() { *v *= cap / step; } }
        x = x.iter().zip(&h).map(|(v, hk)| v + hk).collect();
        if step < 1e-11 * (1.0 + norm(&x)) { break; }
        it += 1;
    }
    f.set(&x);
    let fin = dogleg(f, &x, 50);
    (it, fin)
}
