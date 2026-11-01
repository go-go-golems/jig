# Changelog

## 2026-10-31

- Initial workspace created

## 2026-10-31

Phase 0: ticket, design guide (uploaded to reMarkable), profile showing OCCT wasm = 89% of compile time, esbuild path override, gitignore

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/build.mjs — ESBUILD env override

## 2026-10-31

Phases 1-3: jig-compute Rust crate (wasm, C ABI, no deps), JS bridge with TriSoup and JS fallback, wired into inspect.js/print.js/worker.js; parity 3784/3784; 2.6-7.4x on ported paths; dist ships jig_compute.wasm; browser smoke ok

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/rust/jig-compute/src/lib.rs — C ABI
- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/src/engine/rs/index.js — JS bridge
- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/test/rs/parity.mjs — parity test

## 2026-10-31

Phase 4b: sym.js residual expressions (codegen JS closures + Rust tapes); dogleg/LM/Newton/drag/analyseCluster in Rust with exact reverse-mode Jacobians; identical sketch and book output; runStrategy fallback-state fix

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/rust/jig-compute/src/solve.rs — solver loops in Rust
- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/src/engine/sketch/sym.js — equations as data

## 2026-10-31

Phase 5: stage frames in wasm memory; projection, raster and line classification in Rust on the main thread; bit-identical (181 checks); lines 1.1-1.7x, raster at parity (memory-bound). Ticket complete.

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/rust/jig-compute/src/raster.rs — stage raster and line classification
