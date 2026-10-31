# Build log: who built what

The raw session and subagent transcripts are not stored in this workspace (the session runs remotely; only a few cached tool outputs exist on disk, included under `transcripts/tool-results/`; the book writers' scratch and repro scripts are under `transcripts/agent-scratch/`). This log records every agent of the build: its role, what its brief asked for, and what it reported. The briefs pointed at the contract files in this folder, which are the real shared context: `BUILD.md` (architecture, worker protocol, ProgramData, ownership), `content/PRESET-GUIDE.md` (how presets are written), `INTEGRATION.md` (cross-owner to-dos), `src/engine/CORE-API.md` and `src/engine/KERNEL-API.md` (what the engine implements).

## Before the build: the language

1. **jig spec** (`../jig/`, written in the main session with the grammar-builder skill): the module map (27 sub-languages, narrowed to an 18-module 3D-printing suite), README spec and 40 example files. Six forked writers wrote the examples in parallel (02–09; 10–15; 16–21; 31–36; 40–45; 50–70). A seventh agent wrote `tools/verify-numbers.py` (488 checks; it found 10 wrong numbers, all fixed). A rewrap pass and a grounding pass followed (foundations table, one law suite, jargon matched to the audience).

## Phase 1: five parallel builders (contract: BUILD.md)

| Agent | Brief | Report |
|---|---|---|
| **core** | units, expressions, params with provenance, geometry and datums, patterns, the sketch builder and solver (DOF = n − rank J, redundant vs conflicting with minimal sets, decomposition, warm-started drag), profile detection with exact segments | 58 tests; then the integrator's explicit-geometry rule (sketches without constraints keep their coordinates fixed): 61 tests |
| **kernel** | OpenCascade runtime in Node and the worker, part features with persistent naming from Generated/Modified history, selectors, compile with trace/cache/decisions/IR L0–L6, exports, print modules | 30 tests over 20 scripts; Cavalieri and Pappus volumes exact; Euler–Poincaré residual 0; names stable under edits; STL/STEP/3MF/IR exports |
| **stage** | the drafting-sheet renderer per the Stage guide: software depth buffer, hidden lines, silhouettes, hatched shadows, four views, picking, sketch view with drag | 15 tests; 92 sheets checked; 20k-triangle redraw 14–20 ms |
| **shell** | the Kiln workbench in preact: host API, dock and seven layouts, twelve views, exports via the downloads capability | 43 screenshot checks on the real worker |
| **agent** | the coding agent per the Agent guide: one `eval` tool, YAML results, 25 s timeout, 9,000-character cut, snapshots and revert, Auto/Ask/Read-only, Model and Thinking, threads | 28 unit tests, screenshots in both themes |

## Phase 2: features and content (contract: PRESET-GUIDE.md)

| Agent | Brief | Report |
|---|---|---|
| **kernel round 2** (two agents; the first was stopped by an interruption) | integration fixes; text, threads, involute gears, print-in-place hinges, living hinges, dovetails, draft, rib, split-to-fit | 38 tests; threads match closed-form volumes; ISO 53 gear teeth; real dovetail splits |
| **UI round 2** (two agents; the first was stopped) | integration fixes, preset menu for ~70 presets, Presets shelf, last-good drawing under a fail banner, preset agent briefs, stage fixes on real geometry | 61 checks; the integrator wrote the shelf view itself after the stop |
| **presets: first prints and household** (two agents) | S-01…S-10, H-01…H-14 | 24 presets; nine engine bugs reported with reproductions |
| **presets: desk, workshop, electronics** (two agents) | D-01…D-10, W-01…W-10, X-01…X-08 | 28 presets; seven engine bugs reported |
| **presets: mechanisms and calibration** | C-01…C-06, M-01…M-10 | 16 presets; bugs and slow paths reported |
| **book, reference, docs** (two agents; the first was stopped) | a textbook per the Executable Textbook Handbook, the language reference, four docs | 10 chapters, 41 computed figures, 42 runnable sketches |
| **rewrap** | early presets to 80 columns, same volumes before and after | 16 files, all identical in output |

## Phase 3: fixes and polish

| Agent | Brief | Report |
|---|---|---|
| **kernel round 3** | the writers' bug lists (regions, expressions in holes and transforms, fit values as quantities, shared job params, M10 thread, axis.through); then, at the person's request, wrap up: correctness yes, deep performance no, slow paths opt-in | 40 tests; 71/71 presets; slicing and interference checks only on request |
| **constraints** | constraint display, selection from the sidebar and the sheet, script.js line links | core 62, engine 41, stage 20, UI 69 |

## Integrator (main session)

Wrote BUILD.md, the preset guide, the build script and the preset tools; found the OpenCascade binary in replicad's GitHub repo when npm was blocked; renamed the compressed binary to `.gz.wasm` for the artifact host; fixed the Params sliders (ranges anchored to the code's value); wrote the Presets view, the stage's Sketch menu and sketch inspector, `lab:sketch` links and the A-03 constrained-sketch preset; fixed id collisions and test drift; ran every suite and published.

## Phase 4: fillets, your presets, and Parts V–VI of the book (contract: content/BOOK-GUIDE.md)

The main session first added (no agents): the peg-root fillet and bore lead-in on M-09; a fix for the mesh interference check (edge–triangle crossings); a guard that refuses a fillet or chamfer when OpenCascade drops faces away from the blended edges; presets of your own (U-nn, "Yours": create, rename, delete, autosave; agent `presets.create/rename/current`, `files.rename/remove`; preset-aware eval snapshots); `tools/book-check.mjs`; each sketch's solver dump in the L3 IR; more super- and subscript letters in the maths renderer.

Then seven writers, in parallel, one or two chapters each. Every brief: read BOOK-GUIDE.md (reader, voice, what counts as true, maths limits, figure syntax, the checker, boundaries, the outline of all 13 chapters), build on chapters 3/5, read the named engine sources, take every number from a compile or a scratch script, write only your own chapter files, log issues in BOOK-ISSUES.md (append only) and send important bugs to the editor at once; mid-run they were told to stay lean and not chase details.

| Agent | Chapters | Report |
|---|---|---|
| **ch11–12** | Constraints as equations; Counting freedom | 24.7 + 24.1 KB, 11 blocks. Hand-worked 8 × 8 Jacobian of a corner matches jig to 4.5e-11 (rank 8). Maxwell counterexample (7 bars, 5 joints, rank 24, 4 DOF), Laman, flat 30–40–70 triangle, numerical rank sweep with numpy σ_min. Bugs: distance 0 (fixed), flat triangle false conflict (fixed), `.import` of regions (fixed), driven angle reads 150° at a 30° corner (open), FD step (open). |
| **ch13–14** | Solving the equations; Redundancy and conflict | 25.0 + 23.1 KB, 14 blocks. Newton/GN/LM/dog leg with measured iterates on a 60-35-40 triangle; basins; 379 of 380 preset cluster solves take 0 iterations. Gram–Schmidt rank test, implied-by coefficients 1/60 and 1/52, deletion filter (8 vs 13 tests), QuickXplain described. Bugs: failed local solve reported as conflict (singular start fixed; tiny maxIter open), two independent conflicts mix (open), MCS relative to a hard background (doc), 'bfgs' runs LM, only last solve shown. |
| **ch15–16** | Decomposition and dragging; From curves to profiles | 25.0 + 21.9 KB, 13 blocks. Union–find clusters, Dulmage–Mendelsohn worked on a triangle (own script), graph-constructive solvers; drag as least change (‖h‖ = √432). Arrangement, half-edge walk, shoelace plus circular segments; eight areas match closed forms to 6 decimals. Bugs: drag drift (fixed), hole lost near an arc (fixed), sliver profiles (open). Updated after the fixes. |
| **ch17–18** | Representing solids; Curves and surfaces | 24.5 + 24.8 KB, 12 blocks. Die classified six ways; STEP/STL/mesh sizes; Steinmetz check; de Casteljau and de Boor by hand vs OpenCascade; NURBS circle weights; census of 7,231 preset faces (82.6 % analytic); gear flanks within 1.3e-4 mm of the involute. Bugs: closed splines (open), revolve-cap normals (fixed), tapered sides as B-splines (open), "exact involutes" doc (fixed). |
| **ch19–20** | B-rep from the inside; How a boolean is computed | 24.8 + 23.5 KB, 9 blocks. A block with a hole tabled completely (V 10, E 15, F 7, L 9, G 1), pcurves, 21 Euler operators; the boolean pipeline measured on chapter 5's box ∪ cylinder; the tangent-fillet case study (fails only within ~5e-8 mm of r = 1). Bugs: degenerate edges in genus (fixed), residual 0 by construction (fixed), tangent hole builds a wrong solid (now warned; open), false fillet maximum (fixed as fillet.tangent), binding gaps. |
| **ch21–22** | Blends, offsets and shells; From B-rep to triangles | 25.0 + 22.7 KB, 11 blocks. Peg-root fillet = Pappus to ten digits; Steiner's formula for a rounded box; shells and drafts against closed forms; chord count per circle, STL/3MF/STEP, exact vs mesh mass properties, the mesh-distance pitfall. Bugs: mesh interference misses penetration (fixed), genus (fixed), "max deviation" wording (fixed), 3MF duplicate vertices (fixed), "failed: undefined" (fixed), fillet.order labels and resolution (open), no inertia (open). |
| **ch23** | Building a kernel | 25.0 KB, 6 blocks. History counts from real booleans and fillets; one block as B-rep, mesh and sampled SDF; tolerances; dense QR cost (cubic); FD errors; wasm 22,980,267 B raw, 7,206,977 B gzip, load 0.3–0.8 s, memory 100–199 MiB; a runnable `j.law('fillet.steiner')`. Bugs: genus (fixed), FD step false conflict far from the origin (open), law-suite gaps (open). Updated after the fixes. |

The main session fixed the low-hanging bugs (listed at the end of BOOK-ISSUES.md), kept the rest as documented limitations, linked chapters 3 and 5 forward, checked the reference lists, and ran every suite: engine 42, core 62, agent 29, stage 20, UI 74, presets 72/72, book 159 blocks with no problems.

The writers' scratch and repro scripts are in `transcripts/agent-scratch/ch*/` of the workspace zip.
