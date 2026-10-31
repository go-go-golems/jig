# Integration to-dos (collected from owner reports)

## From agent (done; src/agent/*)
- shell: fix `partM is not defined` in the mock engine (moot once the real worker is wired).
- shell: pass `host.check(files, options)` options (override, config) through to compile.
- shell: set `host.openFile` when the Code tab changes (agent context block).
- shell: refresh selection by edge as well as face after recompile (edges chosen with select() are marked lost).
- shell: show `src/agent/reference.md` in the Reference view (agent API = person's API, one document).
- kernel: answer `call` for faces (records or names), why, feature, sketch, ir(level, { node }), param.
- kernel: put script.js `line` on diagnostics.
- kernel: confirm face centres/normals are body-local (agent's measure applies body transforms).

## From stage (done; src/stage/*)
- stage: when program.ok === false draw host.lastGood (shell asks).
- decisions to confirm: overhang in st-warn; side view from −X; bed coords from 0 unless items centred; refit on every recompile.

## From shell (done; src/ui, src/host; real worker works)
- kernel: honour compile options.keep === false (book figures via check()).
- kernel: in `run`, compile(text) must use text; put `files` in scope.
- kernel: unique graph node ids (sketch and extrude both named 'back' collide).
- kernel: `e.concave` edge predicate selects nothing; summary.sketches reads 0.
- kernel: overrides arrive as quantity text ('80 mm').
- content: chapter front-matter keys `part: I · Title`, `partAbout`, `presets`, `docs`, `book`; docs keys id,title,group,about,order + doc 'reference'; search.js returns { rows: [{ params, metrics, feasible }], objective }.

## From core (done; 58 tests pass)
- DECISION: explicit-geometry default. Sketches with no constraints → numeric coordinates are fixed (DOF 0, decision recorded); with constraints → numbers are starting positions (example 04). Sent to core to implement.
- kernel: call sk.solve({ scope, ctx, plane, external, warm }); pass plane for deferred datums; solveSketch → solved.drag(ref, [x,y]).toSketchData().
