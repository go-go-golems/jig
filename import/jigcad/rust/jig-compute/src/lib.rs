//! jig-compute: the numeric core of the jigcad engine, compiled to `wasm32-unknown-unknown`.
//!
//! The exported functions form a plain C ABI over linear memory (numbers in, numbers out). JS copies inputs into
//! memory obtained from `jc_alloc`, calls a function, and reads variable-length results from `jc_result_ptr()`
//! (valid until the next call). Negative returns mean failure; the message is at `jc_error_ptr()/jc_error_len()`.
//! See ttmp/…/JIG-001-RUST-WASM design doc §6.2 and src/engine/rs/*.js for the JS side.

pub mod gap;
pub mod linalg;
pub mod mem;
pub mod mesh;
pub mod orient;
pub mod section;
pub mod vec3;

use mem::{set_error, set_result, slice};
use mesh::{FaceGeo, TriMesh, GEO_STRIDE};

/// ABI version: major * 1000 + minor. Bump major on breaking changes; the JS bridge checks it.
pub const ABI_VERSION: u32 = 1_001;

#[no_mangle] pub extern "C" fn jc_version() -> u32 { ABI_VERSION }
#[no_mangle] pub extern "C" fn jc_alloc(n: u32) -> *mut u8 { mem::alloc_bytes(n as usize) }
#[no_mangle] pub extern "C" fn jc_free(p: *mut u8, n: u32) { mem::free_bytes(p, n as usize) }
#[no_mangle] pub extern "C" fn jc_result_ptr() -> *const f64 { mem::result_ptr() }
#[no_mangle] pub extern "C" fn jc_error_ptr() -> *const u8 { mem::error_ptr() }
#[no_mangle] pub extern "C" fn jc_error_len() -> u32 { mem::error_len() }

// ── meshes ───────────────────────────────────────────────────────────────────

unsafe fn read_mesh_args<'a>(pos: *const f32, nverts: u32, idx: *const u32, ntri: u32, tri_face: *const u32, m: *const f64, geo: *const f64, nfaces: u32)
    -> (&'a [f32], &'a [u32], &'a [u32], [f64; 16], Vec<FaceGeo>) {
    let pos = slice(pos, nverts as usize * 3);
    let idx = slice(idx, ntri as usize * 3);
    let tf = slice(tri_face, if tri_face.is_null() { 0 } else { ntri as usize });
    let mut mm = vec3::IDENTITY;
    if !m.is_null() { mm.copy_from_slice(slice(m, 16)); }
    let g = slice(geo, nfaces as usize * GEO_STRIDE);
    let faces = g.chunks_exact(GEO_STRIDE).map(FaceGeo::decode).collect();
    (pos, idx, tf, mm, faces)
}
fn check_indices(idx: &[u32], nverts: u32) -> bool { idx.iter().all(|&i| i < nverts) }

/// New mesh handle from one body's display mesh. `tri_face`, `m` and `geo` may be 0 (null).
#[no_mangle]
pub unsafe extern "C" fn jc_mesh_new(pos: *const f32, nverts: u32, idx: *const u32, ntri: u32, tri_face: *const u32, m: *const f64, geo: *const f64, nfaces: u32) -> i32 {
    let (p, i, tf, mm, g) = read_mesh_args(pos, nverts, idx, ntri, tri_face, m, geo, nfaces);
    if !check_indices(i, nverts) { return set_error("jc_mesh_new: index out of range"); }
    let mut t = TriMesh::default();
    t.append(p, i, tf, &mm, &g);
    mesh::insert(t) as i32
}
/// Append another body to an existing mesh; returns the new triangle count.
#[no_mangle]
pub unsafe extern "C" fn jc_mesh_append(h: u32, pos: *const f32, nverts: u32, idx: *const u32, ntri: u32, tri_face: *const u32, m: *const f64, geo: *const f64, nfaces: u32) -> i32 {
    let (p, i, tf, mm, g) = read_mesh_args(pos, nverts, idx, ntri, tri_face, m, geo, nfaces);
    if !check_indices(i, nverts) { return set_error("jc_mesh_append: index out of range"); }
    mesh::with_mut(h, |t| { t.append(p, i, tf, &mm, &g); t.len() as i32 }).unwrap_or_else(|| set_error("jc_mesh_append: stale handle"))
}
/// A new mesh holding the triangles of all given handles, in order (the JS `flatMap` of per-body tris).
#[no_mangle]
pub unsafe extern "C" fn jc_mesh_concat(hs: *const u32, n: u32) -> i32 {
    let mut out = TriMesh::default();
    for &h in slice(hs, n as usize) {
        if mesh::with(h, |t| out.extend(t)).is_none() { return set_error("jc_mesh_concat: stale handle"); }
    }
    mesh::insert(out) as i32
}
#[no_mangle] pub extern "C" fn jc_mesh_len(h: u32) -> i32 { mesh::with(h, |t| t.len() as i32).unwrap_or_else(|| set_error("jc_mesh_len: stale handle")) }
#[no_mangle] pub extern "C" fn jc_mesh_free(h: u32) -> i32 { mesh::remove(h) as i32 }
#[no_mangle] pub extern "C" fn jc_mesh_live() -> u32 { mesh::live() as u32 }
#[no_mangle] pub extern "C" fn jc_mesh_clear() { mesh::clear() }
/// Triangle records, 17 f64 each: a b c n area face cen.
#[no_mangle] pub extern "C" fn jc_mesh_tris(h: u32) -> i32 { mesh::with(h, |t| set_result(t.records())).unwrap_or_else(|| set_error("jc_mesh_tris: stale handle")) }

/// [overhangArea, bedContact, height, supportVolume, lo, hi, ux, uy, uz, nFaces, faces…]
#[no_mangle]
pub extern "C" fn jc_orientation_score(h: u32, ux: f64, uy: f64, uz: f64, max_angle: f64, bed_tol: f64, support_factor: f64) -> i32 {
    mesh::with(h, |t| {
        let s = orient::orientation_score(t, [ux, uy, uz], max_angle, bed_tol, support_factor);
        let mut out = vec![s.overhang_area, s.bed_contact, s.height, s.support_volume, s.lo, s.hi, s.dir[0], s.dir[1], s.dir[2], s.overhang_faces.len() as f64];
        out.extend(s.overhang_faces.iter().map(|&f| f as f64));
        set_result(out)
    }).unwrap_or_else(|| set_error("jc_orientation_score: stale handle"))
}

/// Mesh clearance up to max_d; +∞ when nothing is that close; NaN on a stale handle.
#[no_mangle]
pub extern "C" fn jc_mesh_gap(ha: u32, hb: u32, max_d: f64) -> f64 {
    mesh::with(ha, |a| mesh::with(hb, |b| gap::mesh_gap(a, b, max_d))).flatten().unwrap_or(f64::NAN)
}

/// Section loops at height z: [nLoops, len₀, x, y, …].
#[no_mangle]
pub extern "C" fn jc_mesh_section(h: u32, z: f64) -> i32 {
    mesh::with(h, |t| set_result(section::encode_loops(&section::mesh_section(t, z)))).unwrap_or_else(|| set_error("jc_mesh_section: stale handle"))
}

/// Area properties of nested loops (same encoding as jc_mesh_section): [area, cx, cy, Ixx, Iyy, regions, holes].
#[no_mangle]
pub unsafe extern "C" fn jc_loops_props(p: *const f64, n: u32) -> i32 {
    let loops = section::decode_loops(slice(p, n as usize));
    let r = section::loops_props(&loops);
    set_result(vec![r.area, r.centroid[0], r.centroid[1], r.ixx, r.iyy, r.regions as f64, r.holes as f64])
}

/// Section of a mesh at several heights with properties: for each z, [area, regions, holes] then the loops.
/// Layout: [count, (area, cx, cy, Ixx, Iyy, regions, holes, nLoops, len, x, y, …)…]
#[no_mangle]
pub unsafe extern "C" fn jc_mesh_sections(h: u32, zs: *const f64, n: u32) -> i32 {
    let zs = slice(zs, n as usize);
    mesh::with(h, |t| {
        let mut out = vec![zs.len() as f64];
        for &z in zs {
            let loops = section::mesh_section(t, z);
            let r = section::loops_props(&loops);
            out.extend_from_slice(&[r.area, r.centroid[0], r.centroid[1], r.ixx, r.iyy, r.regions as f64, r.holes as f64]);
            out.extend(section::encode_loops(&loops));
        }
        set_result(out)
    }).unwrap_or_else(|| set_error("jc_mesh_sections: stale handle"))
}

// ── linear algebra ───────────────────────────────────────────────────────────

#[no_mangle]
pub unsafe extern "C" fn jc_qrcp_rank(a: *const f64, m: u32, n: u32, tol: f64) -> i32 {
    linalg::qrcp_rank(slice(a, (m * n) as usize), m as usize, n as usize, tol) as i32
}
/// Minimum-norm solve of J h = b (J is m × n, row-major). Result: h (n), then (n − rank) null-basis vectors
/// of length n when want_null ≠ 0. Returns the rank.
#[no_mangle]
pub unsafe extern "C" fn jc_factor_solve(j: *const f64, m: u32, n: u32, b: *const f64, tol: f64, want_null: u32) -> i32 {
    let (m, n) = (m as usize, n as usize);
    let f = linalg::FactorJ::new(slice(j, m * n), m, n, tol);
    let mut out = if m == 0 { vec![0.0; n] } else { f.solve(slice(b, m)) };
    if want_null != 0 { for v in f.null_basis() { out.extend(v); } }
    set_result(out);
    f.rank as i32
}
/// Cholesky solve of (A + μI) x = b. Returns 1 with x in the result buffer, 0 when not positive definite.
#[no_mangle]
pub unsafe extern "C" fn jc_chol_solve(a: *const f64, n: u32, b: *const f64, mu: f64) -> i32 {
    let n = n as usize;
    match linalg::chol_solve(slice(a, n * n), n, slice(b, n), mu) { Some(x) => { set_result(x); 1 } None => 0 }
}
