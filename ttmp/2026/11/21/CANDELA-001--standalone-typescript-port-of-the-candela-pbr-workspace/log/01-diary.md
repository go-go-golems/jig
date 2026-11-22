---
Title: Diary
Ticket: CANDELA-001
Status: active
Topics:
    - pbr
    - typescript
    - webgpu
    - port
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T19:21:39.370391674-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Step 1: Ticket, import, and a mechanical TypeScript port that already runs

Created the docmgr ticket, imported the Candela workspace archive, and moved its code into a Vite + TypeScript
layout at the repository root without changing behaviour. The goal of this step was a port that *runs*
identically before any typing work starts, so later type fixes can be checked against a known-good baseline.

Outcome: the renamed `.ts`/`.tsx` sources build all 105 presets in Node with output identical to the original
JavaScript, the Vite production build succeeds, and the workbench boots in headless Chromium (WebGL2/SwiftShader)
with no console errors. `tsc` reports 2425 type errors, which is the next step's work.

### Prompt Context
**User prompt (verbatim):** "Create a new docmgr ticket and import /tmp/candela-workspace(1).zip and basically make a typescript standalone version here in this repo."
**Follow-up (verbatim, sent while working):** "commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"
**Assistant interpretation:** Create a ticket, bring the archive into it, and produce a self-contained TypeScript
version of the Candela workbench in this repo (no claude.ai artifact runtime needed), committing in focused
checkpoints with a detailed diary.
**Inferred user intent:** Own Candela as a normal TypeScript project that can be developed, typechecked, built
and run locally, instead of a single generated HTML artifact.

### What I did
- `docmgr init --seed-vocabulary`; the repo's `.ttmp.yaml` had `root: .`, so the first `ticket create-ticket`
  wrote `2026/11/21/...` at the repo root. Removed that, set `root: ttmp`, recreated `CANDELA-001`.
- Added topics `pbr, typescript, webgpu, port` and doc type `log`.
- `docmgr import file --file "/tmp/candela-workspace(1).zip" --name candela-workspace` → `sources/local/candela-workspace.zip`;
  extracted to `sources/candela/`; copied the zip to `~/data/pbr-spark/` (global rule: archives/data live in
  `~/data`). `.gitignore` excludes the zip and the original's `dist/` (2 generated HTML files, 5.3 MB).
- Copied `src/*.js` → `src/engine/*.ts`, `app/*` → `src/app/*.ts(x)`, `content/`, `tools/lockstitch/`, `spec/`.
- Rewrote import specifiers with sed (`../src/` → `../engine/`, dropped `.js/.jsx` extensions); added
  `import React from 'react'` to every TSX file, `react-dom/client` in `main.tsx`, `import katex from 'katex'` in
  `markdown.ts` (was `globalThis.katex`).
- Replaced `window.CANDELA_DATA` (inlined by `build/build.js`) with `src/content/catalog.ts` — the frontmatter,
  preset, doc and doc-reference checks from `build.js`, over a `path → text` map — fed by
  `src/content/browser.ts` (`import.meta.glob(..., { query: '?raw', eager: true })`) and `src/content/node.ts` (fs).
- Two dynamic `import('../src/compile.js')` calls in `host.ts` became a static import (the path only worked
  relative to the original repo layout, and the module is already in the bundle).
- `package.json` (React 18.3.1, KaTeX 0.16.9; dev: TypeScript 5.9, Vite 6, tsx, @webgpu/types, playwright,
  vite-plugin-singlefile), `tsconfig.json` (strict, `noImplicitAny: false` for now), `vite.config.ts`
  (`--mode single` reproduces the original one-file build), `index.html`.
- Ported `test/validate.js` → `scripts/validate.ts` and `test/shot.js` → `scripts/shot.ts` (serves `dist/` itself).

### Why
- Keeping the scene files (`content/presets/*.js`) as JavaScript is deliberate: they are user code executed by
  the engine's own module loader (`runFiles` in `candela.ts`, via `new Function`), not part of the bundle.
- The catalog loader is shared between browser and Node so validation exercises the same parsing the app uses.
- Ran the original `test/validate.js` first to capture a baseline (`various/01-baseline-validate-original-js.txt`).

### What worked
- Baseline: `NODE_PATH=$PWD/node_modules node sources/candela/test/validate.js` → `105/105 build`.
- Port: `npx tsx scripts/validate.ts` → `105/105 build`; `diff` against the baseline (whitespace-normalised) is empty.
- `npx vite build` → `dist/assets/index-*.js 2,633.90 kB │ gzip: 780.85 kB`.
- `npx tsx scripts/shot.ts B-01 shots/b01-webgl2.png 1440 900 8000 light webgl2` →
  `{"preset":"B-01","ok":true,"backend":"WebGL2","spp":0}` / `no console errors`; the screenshot shows the
  workbench with the sphere rendering.

### What didn't work
- First `docmgr ticket create-ticket` created the ticket under `./2026/...` because `.ttmp.yaml` said `root: .`.
  Fixed by `root: ttmp`.
- First `npx vite build`: `Could not resolve "../src/compile.js" from "src/app/host.ts"` — a dynamic import my
  sed did not cover (it only matched `from '...'`/`import '...'`). Fixed by importing `compile` statically.
- `npx tsc --noEmit -p .` → 2425 errors (1589 TS2339 missing property, 209 TS2554 arity, 201 TS2345, 198 TS2322).
  Biggest buckets: properties on `{}` (402), on `never` (301, from `[]` literals), undeclared class fields on
  `Host` (245), `Viewport` (147), `GLRenderer` (102), `GPURenderer` (87), `VideoWriter` (41).

### What I learned
- The engine measures how many lines `new Function` prepends (`measure()` in `candela.ts`) to map stack traces
  to scene-file lines; this still works under tsx/Node 26 (identical diagnostics in the validate diff).
- npm 11 gates install scripts (`esbuild postinstall` warning), but esbuild works through its platform package.

### What was tricky to build
- Making the content pipeline identical: `build.js` ran at bundle time in Node; Vite's glob returns
  `/content/...` keys, so `browser.ts` strips that prefix to share `catalog.ts` with Node. `content/gen/` is
  skipped in Node (Python generators, not content).

### What warrants a second pair of eyes
- `spp: 0` in the headless screenshot after 8 s: the image shows a noisy first frame. Likely headless
  rAF throttling with SwiftShader, but it should be compared with the original `dist/local.html` under the same
  harness before claiming render parity.

### What should be done in the future
- Steps 2–3: make `tsc` pass; replace the claude.ai-only paths (agent sampling, downloads).

### Code review instructions
- Start at `src/content/catalog.ts`, `src/app/main.tsx`, `vite.config.ts`, `scripts/validate.ts`.
- Validate: `npm install && npm run validate && npm run build && npx tsx scripts/shot.ts B-01 shots/b01.png`.

### Technical details
- Original → port path map: `src/X.js` → `src/engine/X.ts`; `app/X.js` → `src/app/X.ts`; `app/ui/X.jsx` →
  `src/app/ui/X.tsx`; `app/main.jsx` → `src/app/main.tsx`; `build/build.js` → `src/content/*.ts` + Vite.
