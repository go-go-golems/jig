//! Scratch memory, the f64 result buffer and the last error for the C ABI.
use std::alloc::{alloc, dealloc, Layout};
use std::cell::RefCell;

thread_local! {
    static RESULT: RefCell<Vec<f64>> = RefCell::new(Vec::new());
    static ERROR: RefCell<String> = RefCell::new(String::new());
}

pub fn alloc_bytes(n: usize) -> *mut u8 {
    if n == 0 { return 8 as *mut u8; }
    unsafe { alloc(Layout::from_size_align_unchecked(n, 8)) }
}
pub fn free_bytes(p: *mut u8, n: usize) {
    if n == 0 || p.is_null() { return; }
    unsafe { dealloc(p, Layout::from_size_align_unchecked(n, 8)) }
}

/// Replace the result buffer; returns its length (what the exported function returns to JS).
pub fn set_result(v: Vec<f64>) -> i32 {
    let n = v.len() as i32;
    RESULT.with(|r| *r.borrow_mut() = v);
    n
}
pub fn result_ptr() -> *const f64 { RESULT.with(|r| r.borrow().as_ptr()) }

pub fn set_error(msg: &str) -> i32 {
    ERROR.with(|e| { let mut e = e.borrow_mut(); e.clear(); e.push_str(msg); });
    -1
}
pub fn error_ptr() -> *const u8 { ERROR.with(|e| e.borrow().as_ptr()) }
pub fn error_len() -> u32 { ERROR.with(|e| e.borrow().len() as u32) }

/// Borrow a slice from a JS-provided pointer (null or zero length → empty).
pub unsafe fn slice<'a, T>(p: *const T, n: usize) -> &'a [T] {
    if p.is_null() || n == 0 { &[] } else { std::slice::from_raw_parts(p, n) }
}
