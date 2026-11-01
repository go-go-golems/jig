use jig_compute::{gap, linalg, mesh::TriMesh, orient, section, vec3::IDENTITY};

/// Axis-aligned box [0,w]×[0,d]×[0,h] as 12 outward triangles.
fn boxmesh(w: f32, d: f32, h: f32, dx: f32) -> TriMesh {
    let p: Vec<f32> = vec![0., 0., 0., w, 0., 0., w, d, 0., 0., d, 0., 0., 0., h, w, 0., h, w, d, h, 0., d, h]
        .chunks(3).flat_map(|c| [c[0] + dx, c[1], c[2]]).collect();
    let idx: Vec<u32> = vec![0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    let mut t = TriMesh::default();
    t.append(&p, &idx, &[], &IDENTITY, &[]);
    t
}

#[test]
fn box_orientation_up() {
    let m = boxmesh(10., 20., 30., 0.);
    let s = orient::orientation_score(&m, [0., 0., 1.], std::f64::consts::FRAC_PI_4, 1e-3, 1.0);
    assert!((s.bed_contact - 200.0).abs() < 1e-9, "{s:?}");
    assert_eq!(s.overhang_area, 0.0);
    assert!((s.height - 30.0).abs() < 1e-12);
    assert_eq!(s.support_volume, 0.0);
    // upside down: the top face is now the bed, the old bottom does not overhang (it is on the far side)
    let s = orient::orientation_score(&m, [0., 0., -1.], std::f64::consts::FRAC_PI_4, 1e-3, 1.0);
    assert!((s.bed_contact - 200.0).abs() < 1e-9);
}

#[test]
fn box_section_and_props() {
    let m = boxmesh(10., 20., 30., 0.);
    let loops = section::mesh_section(&m, 15.0);
    assert_eq!(loops.len(), 1);
    let p = section::loops_props(&loops);
    assert!((p.area - 200.0).abs() < 1e-6, "{p:?}");
    assert!((p.centroid[0] - 5.0).abs() < 1e-6 && (p.centroid[1] - 10.0).abs() < 1e-6);
    assert!((p.ixx - 10.0 * 20f64.powi(3) / 12.0).abs() < 1e-3);
}

#[test]
fn loops_with_hole() {
    let outer = vec![[0., 0.], [10., 0.], [10., 10.], [0., 10.]];
    let hole = vec![[2., 2.], [4., 2.], [4., 4.], [2., 4.]];
    let p = section::loops_props(&[outer, hole]);
    assert!((p.area - 96.0).abs() < 1e-12);
    assert_eq!((p.regions, p.holes), (1, 1));
}

#[test]
fn gaps() {
    let a = boxmesh(10., 10., 10., 0.);
    let b = boxmesh(10., 10., 10., 12.);
    let g = gap::mesh_gap(&a, &b, 5.0);
    assert!((g - 2.0).abs() < 1e-9, "{g}");
    assert!(gap::mesh_gap(&a, &b, 1.0).is_infinite());
    let c = boxmesh(10., 10., 10., 5.); // overlapping
    assert_eq!(gap::mesh_gap(&a, &c, 1.0), 0.0);
    let inner = { let mut t = TriMesh::default(); let s = boxmesh(2., 2., 2., 0.); let m = [1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 4., 4., 4., 1.];
        let pos: Vec<f32> = (0..s.len()).flat_map(|i| s.verts(i)).flat_map(|v| v.map(|x| x as f32)).collect();
        let idx: Vec<u32> = (0..pos.len() as u32 / 3).collect(); t.append(&pos, &idx, &[], &m, &[]); t };
    assert_eq!(gap::mesh_gap(&a, &inner, 0.5), 0.0, "contained mesh");
}

#[test]
fn linalg_rank_and_solve() {
    // rank-2 3×3
    let a = [1., 2., 3., 2., 4., 6., 1., 0., 1.];
    assert_eq!(linalg::qrcp_rank(&a, 3, 3, 1e-10), 2);
    // underdetermined J (1 × 2): x + y = 2 → min-norm (1, 1); null basis ∝ (1, −1)
    let f = linalg::FactorJ::new(&[1., 1.], 1, 2, 1e-10);
    let h = f.solve(&[2.0]);
    assert!((h[0] - 1.0).abs() < 1e-12 && (h[1] - 1.0).abs() < 1e-12);
    let nb = f.null_basis();
    assert_eq!(nb.len(), 1);
    assert!((nb[0][0] + nb[0][1]).abs() < 1e-12);
    let x = linalg::chol_solve(&[4., 2., 2., 3.], 2, &[2., 1.], 0.0).unwrap();
    assert!((4. * x[0] + 2. * x[1] - 2.).abs() < 1e-12 && (2. * x[0] + 3. * x[1] - 1.).abs() < 1e-12);
}
