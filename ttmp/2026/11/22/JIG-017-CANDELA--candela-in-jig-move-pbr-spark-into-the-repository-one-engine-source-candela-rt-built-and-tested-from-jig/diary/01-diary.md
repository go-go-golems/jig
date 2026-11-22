---
Title: Diary
Ticket: JIG-017-CANDELA
Status: active
Topics:
    - rendering
    - gpu
    - build
DocType: diary
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-22T15:35:23.788644575-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

This diary records JIG-017: moving the Candela renderer (the pbr-spark repository: its TypeScript engine, its own workbench and candela-rt, the native NVIDIA renderer) into jig, so that jig has one engine source, builds and tests candela-rt from its own tree, and the integration is clean. It also records writing the intern guide for that system.

## Step 1: the ticket, the branch, and the repository moved in

This step set up the work and did the one irreversible-looking move: pbr-spark's whole history went into jig at `import/candela` through `git subtree add`. Everything stays on a branch, `jig-017-candela`, stacked on `jig-016-render`, because jig PR #5 is still open.

### Prompt Context
**User prompt (verbatim):** "Ok, create a new docmgr ticket, and integrate and clean up candela to have it cleanly integrated into the system. Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"

**Assistant interpretation:** act on the plan given just before:
- move pbr-spark into jig with its history;
- one engine source, deleting jig's vendored copy;
- a clean build of candela-rt from jig, plus CI and release plumbing;
- clean up what the move duplicates or breaks;
- the intern guide, stored in the ticket and uploaded to reMarkable;
- commits and an investigation-format diary throughout.

**Inferred user intent:** stop maintaining two repositories and a vendored copy; make the renderer a first-class part of jig that the next person can understand and change.

### What I did
- Checked the state:
  - jig PR #5 (JIG-016) is open.
  - pbr-spark PRs #2 (candela-rt OptiX shader execution reordering and built-in spheres) and #3 (path ids) are merged.
  - pbr-spark `origin/main` is `e3b799e`: 48 commits, all by one author. Both repositories are public, so importing history publishes nothing new.
- Created branch `jig-017-candela` from `jig-016-render` (`55080ff`).
- `docmgr ticket create-ticket --ticket JIG-017-CANDELA`, then `doc add` for the design doc and the diary.
- Started a research agent on candela-rt's C++ side, read-only: the command line, V8 embedding, GPU paths, the `serve` protocol, the CMake build, and path assumptions that a move would break.
- **Moved the repository:** `git subtree add --prefix=import/candela git@github.com:wesen/2026-11-21--pbr-spark.git main`, which produced merge commit `9353740`.

### Why
- **Subtree, not submodule.** Development should move into jig: one checkout, one PR, history kept. A submodule would keep two repositories in two states.
- **`import/candela`.** It sits next to `import/jigcad`, as JIG-016's guide planned in §8.2. Candela's internal relative paths stay intact.

### What worked
- `git subtree add` printed `Added dir 'import/candela'`. The tree has `content`, `native`, `scripts`, `src`, `tests`, `tools`, `ttmp`, Candela's docmgr scaffolding and its npm files.

### What didn't work
- Nothing in this step.

### What I learned
- **Large files.** The biggest are CANDELA-002 screenshots (1.3 MB) and the lockstitch data (1.15 MB). The lockstitch data is in the tree twice: once in `content/` and once under CANDELA-001's `sources/`, an archive of the original workspace. The whole pack is 8.2 MiB.

### Code review instructions
- `git show --stat 9353740 | tail -1` gives the size. `git log --oneline 9353740^2 | head` shows pbr-spark's history, now reachable from jig.

## Step 2: one engine source, and the move's leftovers cleaned up

This step made jig build Candela from `import/candela` and removed the vendored copy. It then cleaned up what the move left duplicated or pointing at the old repository: a second docmgr root, Candela's core-bundle location, and Candela's tests needing npm.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** the "integrate and clean up" half of the request.
**Inferred user intent:** one source of truth, nothing half-moved.
**Commit (code):**
- `f9f68fb` "One Candela engine: jig builds from import/candela, the vendored copy is gone";
- `2fddb90` "Candela cleaned into jig: one docmgr root, the core where Candela looks, its tests without npm".

### What I did
**Engine source.**
- `diff -rq import/jigcad/vendor/candela/src import/candela/src` showed four engine files changed since the vendored commit `38fc068`: `compile.ts`, `headless.ts`, `targets/cuda.ts` and `targets/optix.ts`. All four come from pbr-spark #2 (shader execution reordering and built-in spheres).
- `src/render/candela.js` now imports from `../../../candela/src/engine/…`.
- `build.mjs` gained `const CANDELA = join(ROOT, '..', 'candela')`.
- Removed `vendor/candela`, `tools/vendor-candela.sh` and `make vendor-candela`.

**The core bundle** is written to `import/candela/dist-core/candela-core.js` and copied byte for byte into `dist/`. A `.sha256` goes beside each.
- The copy is an esbuild `onEnd` plugin, so watch mode keeps the two in step.
- The build is not minified, and runs with `absWorkingDir` set to Candela's root, so the module comments match `scripts/bundle-core.ts`.

**Candela's tests without npm.** `scripts/node-tests.mjs` bundles `tests/session.test.ts` and `tests/golden-pack.test.ts` with jig's esbuild into `build/node-tests/` and runs them. Its `--run <script.ts> -- args` form runs any Node-only script the same way.
- `parseArgs` moved to `scripts/args.ts`, and `render-preset.ts` re-exports it. `core-digest.ts`, which the golden test imports, then no longer loads Playwright.
- `core-digest.ts --compare` now sets a non-zero exit code on a difference.

**One docmgr root.**
- `git mv import/candela/ttmp/2026/11/21 ttmp/2026/11/21`.
- Related-file links rewritten: 23 from `repo://src/…` to `repo://import/candela/src/…`, and 2 from `repo://import/candela/ttmp/` to `repo://ttmp/`.
- `docmgr vocab add` for the topics `pbr`, `typescript`, `webgpu`, `port`, `optix` and `build`, and the doc type `log`.
- Removed Candela's `.ttmp.yaml`, `vocabulary.yaml`, `ttmp/vocabulary.yaml`, `.docmgrignore`, `_guidelines` and `_templates`. The guidelines and templates were identical to jig's (`diff -rq` printed nothing).

**candela-rt map.** Saved the research agent's map of candela-rt as the ticket's reference doc.

### Why
- **Write the core where Candela looks.** candela-rt's `--bundle` default, `core-digest.ts` and the golden test all read `dist-core/candela-core.js` relative to Candela's root. Writing it there leaves every Candela tool working unchanged.
- **Bundle the tests rather than install npm in CI.** jig's build has no npm dependencies, and an `npm ci` under `import/candela` would download React, Vite, Playwright and Dawn just to run two engine tests.

### What worked
- `make web`, then the render tests (74/74) and `test/ui/render.cjs` (14/14, `load 250 ms`) on the moved engine.
- `sha256sum` of `dist/candela-core.js` and `import/candela/dist-core/candela-core.js` are equal (`4d3dc79c23bef5a5…`).
- The session test through `node-tests.mjs` printed `session: all checks passed`.
- `node scripts/node-tests.mjs --run scripts/core-digest.ts -- --ids B-01,K-09 --json build/node-digest.json`, then `--compare build/node-digest.json`, gave `2/2 identical`, exit 0.
- `docmgr doctor` on CANDELA-001 and CANDELA-002: no missing related files after the rewrite.

### What didn't work
- **The first golden run** failed with `ENOENT … import/candela/dist-core/candela-core.js`: the core was still only in jig's `dist/`. That is fixed by writing it to `dist-core` as above.
- **The second golden run** failed after 389.7 s. The rerun with captured output said `golden pack: 95/105 identical in 452.8 s`. It differs on F-08 (meta), R-05 (O), and K-01, K-03…K-09 (SDs). I'm investigating this in Step 3.
- **The first Python vocabulary comparison** died with `ModuleNotFoundError: No module named 'yaml'`. I compared with grep instead.
- **My first `build.mjs` comment** claimed jig and `bundle-core.ts` "make the same bytes". The research agent built both and found that false:
  - the module path comments differ when the build runs from `import/jigcad`;
  - esbuild 0.25.12 (jig) and 0.28.2 (Candela's npm tree, through tsx) differ by `/* @__PURE__ */` annotations.

  Setting `absWorkingDir` fixed the comments. The comment now says what is true: nothing compares bundle bytes, and `irHash` is the agreement.

### What I learned
- **The two bundles are different artifacts.** jig's `dist/candela.js` (an ES module, engine plus browser layer) is not `candela-core.js` (an IIFE, core only). The page never loads `candela-core.js`; it is only for candela-rt.
- **candela-rt cannot receive a CAD package yet.** It has no `scope` in `HeadlessOptions` or in `serve`, no offline render from files, and no messages for poses or jobs (reference doc §7). That shapes Part 8 of the guide.

### What was tricky to build
- **Placing the test bundles.** `src/content/node.ts` resolves `content/` from its own file (`../../content`). The test bundles must therefore sit exactly two levels below Candela's root, which is why they go in `build/node-tests/`.

### What warrants a second pair of eyes
- **The 378 renamed ticket files,** and that history follows them: `git log --follow ttmp/2026/11/21/CANDELA-002…/index.md`.

### Code review instructions
- `import/jigcad/build.mjs` (`CANDELA`, `candelaCore`, `coreCopy`), `import/candela/scripts/node-tests.mjs` and `args.ts`.
- Validate:

  ```sh
  make web
  node --test import/jigcad/test/render/*.test.mjs
  cd import/candela && ESBUILD=… node scripts/node-tests.mjs session
  ```

## Step 3: candela-rt found next to jigcad, built from jig, tested on a GPU runner; the guide

This step made jig able to build and run candela-rt from its own tree and test it on an NVIDIA runner. It then wrote the intern guide. The golden test's ten differences are being bisected in parallel.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** candela-rt "cleanly integrated": a build target, a lookup that matches a release layout, CI; and the guide.
**Inferred user intent:** the native worker as a first-class part of jig.
**Commit (code):** `468928c` "jigcad serve --render auto finds candela-rt next to the jigcad binary". The Makefile, workflow and guide commit follows once the golden question is settled.

### What I did
**Finding candela-rt.** `pkg/render/find.go` gained `selfDir()` (`os.Executable`, symlinks resolved). `auto` now tries `$JIGCAD_CANDELA_RT`, then `<jigcad's dir>/candela-rt`, then `PATH`.
- `TestFind` covers the order, by swapping `selfDir` in the test.
- The `serve` help text and the `Mode` comment are updated.

**Makefile.**
- New variables: `CANDELA`, `RT_BUILD` (`import/candela/build/rt`, where Candela's scripts look), `OPTIX_DIR`, `RENDER`.
- `candela-rt`: `cmake -S import/candela/native/rt -B $(RT_BUILD) -G Ninja [-DOptiX_INSTALL_DIR=…]`, then `ninja`.
- `serve` passes `--render $(RENDER)`. `test-candela` is new, and `test-js` ends with it. `clean` removes `dist-core` and `build/node-tests`.

**`.github/workflows/candela-rt.yml`.** It runs on `[self-hosted, linux, nvidia]`, only `if: vars.NVIDIA_RUNNER == 'true'`, and triggers on paths under Candela, the build, `pkg/render`, the Makefile and itself. Its steps:
1. `make web`;
2. `make candela-rt`;
3. `candela-rt digest`, compared with Node's digests through `core-digest.ts`;
4. `cuda-sweep` with both backends;
5. a 320×180 still;
6. `jigcad serve --render …`, polling `/api/render/capabilities` until it reaches `up`.

`.github/actionlint.yaml` declares the `nvidia` label.

**The guide** (`design-doc/01-…`) is written. Its parts:
- the system on one page;
- jig's parts;
- Candela's engine (scenes, compile, pack, browser layer, core);
- candela-rt (V8, GPU path, protocol, build, checks, supervision);
- JIG-016's integration;
- JIG-017's steps;
- the next phases: scope, OptiX mode, jobs, remote GPU, poses, releases, safety;
- API and file references, decisions and a glossary.

### Why
- **Next to the binary.** That is the only lookup a release can rely on: unpack two files into one directory.
- **The GPU job is gated by a variable.** Without the runner, a job with `runs-on: [self-hosted, nvidia]` would wait in the queue until GitHub cancels it.

### What worked
- `GOWORK=off go test ./pkg/render/ ./pkg/server/ -count=1`: both ok. `go build ./cmd/jigcad` succeeds.
- `actionlint` on all workflows: exit 0, after adding the label config.
- `make -n candela-rt OPTIX_DIR=/opt/x` prints the expected cmake and ninja lines.

### What didn't work
- **actionlint's first run:** `label "nvidia" is unknown … if it is a custom label for self-hosted runner, set list of labels in actionlint.yaml config file [runner-label]`. Fixed by adding `.github/actionlint.yaml`.

### What I learned
- **`/api/render/capabilities`** reports the states `off`, `starting`, `up` and `down` (`pkg/render/render.go:37–40`). The CI step waits for `up`.

### What warrants a second pair of eyes
- **`make candela-rt` and the GPU workflow have not run anywhere.** This machine has no NVIDIA GPU, and no runner is registered.

### Code review instructions
- `pkg/render/find.go`, `Makefile`, `.github/workflows/candela-rt.yml`.
