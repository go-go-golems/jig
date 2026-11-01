use jig_compute::{solve, tape::Tape};

/// one equation per op, over x = [0.7, -1.3, 2.1]; checks values against closed forms and gradients against
/// central differences
fn ins(rows: &[[f64; 4]]) -> Vec<f64> { rows.iter().flatten().copied().collect() }

#[test]
fn every_op_value_and_gradient() {
    // equation k: [x0, x1, op(x0, x1)] (unary ops use x0 only)
    let ops_ = [2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0];
    let mut all = Vec::new();
    let mut starts = vec![0u32];
    for &op in &ops_ {
        let x0 = if op == 7.0 { 2.0 } else { 0.0 }; // sqrt of x2 (positive)
        all.extend(ins(&[[1.0, -1.0, -1.0, x0], [1.0, -1.0, -1.0, 1.0], [op, 0.0, 1.0, 0.0]]));
        starts.push(starts.last().unwrap() + 3);
    }
    let t = Tape::decode(&all, &starts).unwrap();
    let x = [0.7, -1.3, 2.1];
    let col_of = [0, 1, 2];
    let (mut val, mut adj) = (Vec::new(), Vec::new());
    for e in 0..t.count() {
        let mut row = [0.0; 3];
        t.grad(e, &x, &col_of, &mut row, &mut val, &mut adj);
        for p in 0..3 {
            let h = 1e-6;
            let (mut xp, mut xm) = (x, x);
            xp[p] += h; xm[p] -= h;
            let fd = (t.eval(e, &xp, &mut val) - t.eval(e, &xm, &mut val)) / (2.0 * h);
            assert!((fd - row[p]).abs() < 1e-6, "op {} d/dx{}: exact {} fd {}", ops_[e], p, row[p], fd);
        }
    }
}

#[test]
fn solve_distance_and_drag() {
    // points p = (x0, x1), q = (x2, x3); equations: x0 = 0, x1 = 0, |q − p| − 5 = 0
    let rows: Vec<[f64; 4]> = vec![
        [1.0, -1.0, -1.0, 0.0],                                   // eq 0: x0
        [1.0, -1.0, -1.0, 1.0],                                   // eq 1: x1
        [1.0, -1.0, -1.0, 2.0], [1.0, -1.0, -1.0, 0.0], [3.0, 0.0, 1.0, 0.0],      // eq 2: hypot(x2 − x0, x3 − x1) − 5
        [1.0, -1.0, -1.0, 3.0], [1.0, -1.0, -1.0, 1.0], [3.0, 3.0, 4.0, 0.0],
        [11.0, 2.0, 5.0, 0.0], [0.0, -1.0, -1.0, 5.0], [3.0, 6.0, 7.0, 0.0],
        [1.0, -1.0, -1.0, 2.0],                                   // eq 3: x2 (drag handle x)
        [1.0, -1.0, -1.0, 3.0],                                   // eq 4: x3 (drag handle y)
    ];
    let t = Tape::decode(&ins(&rows), &[0, 1, 2, 11, 12, 13]).unwrap();
    let x = vec![0.3, -0.2, 3.0, 1.0];
    let mut p = solve::Problem::new(&t, x, vec![0, 1, 2, 3], vec![0, 1, 2]);
    let x0 = p.get();
    let (o, used, _) = solve::run_strategy(&mut p, &x0, 0, 1, -1, 1e-3);
    assert!(o.converged, "{o:?}");
    assert_eq!(used, 0);
    let d = (p.x[2] - p.x[0]).hypot(p.x[3] - p.x[1]);
    assert!((d - 5.0).abs() < 1e-9 && p.x[0].abs() < 1e-12);
    // drag q toward (0, 9): it must land on the circle of radius 5 at (0, 5)
    let (_, fin) = solve::drag(&mut p, 3, 4, [0.0, 9.0], 40);
    assert!(fin.converged);
    // the least-change iteration approaches the nearest point asymptotically (40 steps): 1e-4 here, as in JS
    assert!(p.x[2].abs() < 1e-3 && (p.x[3] - 5.0).abs() < 1e-6, "{:?}", p.x);
}
