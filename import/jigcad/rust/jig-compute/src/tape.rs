//! Residual tapes (src/engine/sketch/sym.js buildTape): constraint equations as data, evaluated with exact
//! reverse-mode derivatives. One tape holds many equations; equation e is instructions starts[e]..starts[e+1],
//! each [op, a, b, v] with a, b relative to the equation's start (−1 = none) and v a constant or parameter index.
use std::cell::RefCell;
use std::f64::consts::PI;

const TAU: f64 = 2.0 * PI;

#[derive(Clone, Copy, Debug)]
pub struct Ins { pub op: u8, pub a: i32, pub b: i32, pub v: f64 }

#[derive(Clone, Debug, Default)]
pub struct Tape { pub ins: Vec<Ins>, pub starts: Vec<u32> }

pub fn wrap_pi(a: f64) -> f64 { let mut x = (a + PI) % TAU; if x < 0.0 { x += TAU; } x - PI }
/// constraints.js sweep: ((a1 − a0) % 2π + 2π) % 2π, 2π when ≈ 0
pub fn sweep(a0: f64, a1: f64) -> f64 { let s = ((a1 - a0) % TAU + TAU) % TAU; if s < 1e-12 { TAU } else { s } }
/// geom2d.js sweepCCW: wrap2Pi(a1 − a0), 2π when ≈ 0
pub fn sweep_ccw(a0: f64, a1: f64) -> f64 { let mut s = (a1 - a0) % TAU; if s < 0.0 { s += TAU; } if s < 1e-12 { TAU } else { s } }
/// JS `x || 1e-300`
#[inline] fn nz(x: f64) -> f64 { if x == 0.0 || x.is_nan() { 1e-300 } else { x } }
/// Math.hypot(a, b), scaled
#[inline] fn hypot2(a: f64, b: f64) -> f64 { crate::vec3::hypot3(a, b, 0.0) }

impl Tape {
    pub fn decode(ops: &[f64], starts: &[u32]) -> Result<Tape, &'static str> {
        let ins: Vec<Ins> = ops.chunks_exact(4).map(|c| Ins { op: c[0] as u8, a: c[1] as i32, b: c[2] as i32, v: c[3] }).collect();
        if starts.is_empty() || *starts.last().unwrap() as usize != ins.len() { return Err("tape: bad starts"); }
        for e in 0..starts.len() - 1 {
            let (s, t) = (starts[e] as usize, starts[e + 1] as usize);
            if s >= t { return Err("tape: empty equation"); }
            for (k, i) in ins[s..t].iter().enumerate() {
                if i.op > 15 || i.a >= k as i32 || i.b >= k as i32 { return Err("tape: bad instruction"); }
                if i.op == 1 && i.v < 0.0 { return Err("tape: bad parameter index"); }
            }
        }
        Ok(Tape { ins, starts: starts.to_vec() })
    }
    pub fn count(&self) -> usize { self.starts.len() - 1 }

    /// Forward pass of equation e into `val` (resized); returns the residual.
    pub fn eval(&self, e: usize, x: &[f64], val: &mut Vec<f64>) -> f64 {
        let (s, t) = (self.starts[e] as usize, self.starts[e + 1] as usize);
        val.clear();
        for i in &self.ins[s..t] {
            let a = if i.a >= 0 { val[i.a as usize] } else { 0.0 };
            let b = if i.b >= 0 { val[i.b as usize] } else { 0.0 };
            let r = match i.op {
                0 => i.v,
                1 => x.get(i.v as usize).copied().unwrap_or(f64::NAN),
                2 => a + b, 3 => a - b, 4 => a * b, 5 => a / b, 6 => -a,
                7 => a.sqrt(), 8 => a.sin(), 9 => a.cos(), 10 => a.atan2(b), 11 => hypot2(a, b),
                12 => nz(a), 13 => wrap_pi(a), 14 => sweep(a, b), _ => sweep_ccw(a, b),
            };
            val.push(r);
        }
        val[t - s - 1]
    }

    /// Residual and gradient of equation e: adds ∂r/∂x[p] into row[col_of[p]] for parameters with a column.
    pub fn grad(&self, e: usize, x: &[f64], col_of: &[i32], row: &mut [f64], val: &mut Vec<f64>, adj: &mut Vec<f64>) -> f64 {
        let r = self.eval(e, x, val);
        let (s, t) = (self.starts[e] as usize, self.starts[e + 1] as usize);
        let n = t - s;
        adj.clear();
        adj.resize(n, 0.0);
        adj[n - 1] = 1.0;
        for k in (0..n).rev() {
            let g = adj[k];
            if g == 0.0 { continue; }
            let i = self.ins[s + k];
            let (ia, ib) = (i.a.max(0) as usize, i.b.max(0) as usize);
            let a = if i.a >= 0 { val[ia] } else { 0.0 };
            let b = if i.b >= 0 { val[ib] } else { 0.0 };
            match i.op {
                1 => { let p = i.v as usize; if let Some(&c) = col_of.get(p) { if c >= 0 { row[c as usize] += g; } } }
                2 => { adj[ia] += g; adj[ib] += g; }
                3 => { adj[ia] += g; adj[ib] -= g; }
                4 => { adj[ia] += g * b; adj[ib] += g * a; }
                5 => { adj[ia] += g / b; adj[ib] -= g * a / (b * b); }
                6 => { adj[ia] -= g; }
                7 => { adj[ia] += g * 0.5 / val[k]; }
                8 => { adj[ia] += g * a.cos(); }
                9 => { adj[ia] -= g * a.sin(); }
                10 => { let d = a * a + b * b; if d > 0.0 { adj[ia] += g * b / d; adj[ib] -= g * a / d; } }
                11 => { let h = val[k]; if h > 0.0 { adj[ia] += g * a / h; adj[ib] += g * b / h; } }
                12 => { if a != 0.0 && !a.is_nan() { adj[ia] += g; } }
                13 => { adj[ia] += g; }
                14 | 15 => {
                    // d/da1 = 1, d/da0 = −1, except where the sweep is clamped to 2π (raw sweep ≈ 0): constant there
                    let mut raw = (b - a) % TAU; if raw < 0.0 { raw += TAU; }
                    if raw >= 1e-12 { adj[ia] -= g; adj[ib] += g; }
                }
                _ => {}
            }
        }
        r
    }
}

// ── registry (generation-tagged handles, capped: the oldest tape goes when the cap is reached) ──────────────
struct Slot { gen: u32, tape: Option<Tape>, born: u64 }
struct Reg { slots: Vec<Slot>, clock: u64 }
thread_local! { static REG: RefCell<Reg> = const { RefCell::new(Reg { slots: Vec::new(), clock: 0 }) }; }
pub const CAP: usize = 1024;

pub fn insert(t: Tape) -> u32 {
    REG.with(|r| {
        let mut r = r.borrow_mut();
        r.clock += 1;
        let clock = r.clock;
        let live = r.slots.iter().filter(|s| s.tape.is_some()).count();
        if live >= CAP {
            if let Some(old) = r.slots.iter_mut().filter(|s| s.tape.is_some()).min_by_key(|s| s.born) { old.tape = None; }
        }
        let i = match r.slots.iter().position(|s| s.tape.is_none()) { Some(i) => i, None => { r.slots.push(Slot { gen: 0, tape: None, born: 0 }); r.slots.len() - 1 } };
        let s = &mut r.slots[i];
        s.gen = (s.gen + 1) & 0x7fff;
        s.tape = Some(t);
        s.born = clock;
        (s.gen << 16) | (i as u32 + 1)
    })
}
pub fn with<R>(h: u32, f: impl FnOnce(&Tape) -> R) -> Option<R> {
    let i = (h & 0xffff) as usize;
    if i == 0 { return None; }
    REG.with(|r| { let r = r.borrow(); let s = r.slots.get(i - 1)?; if s.gen != h >> 16 { return None; } s.tape.as_ref().map(f) })
}
pub fn remove(h: u32) -> bool {
    let i = (h & 0xffff) as usize;
    if i == 0 { return false; }
    REG.with(|r| { let mut r = r.borrow_mut(); match r.slots.get_mut(i - 1) { Some(s) if s.gen == h >> 16 && s.tape.is_some() => { s.tape = None; true } _ => false } })
}
pub fn live() -> usize { REG.with(|r| r.borrow().slots.iter().filter(|s| s.tape.is_some()).count()) }
