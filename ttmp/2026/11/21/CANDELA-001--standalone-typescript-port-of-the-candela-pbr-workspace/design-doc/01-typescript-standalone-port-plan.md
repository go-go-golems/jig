---
Title: TypeScript standalone port plan
Ticket: CANDELA-001
Status: active
Topics:
    - pbr
    - typescript
    - webgpu
    - port
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "How the Candela workspace (JS, bundled into one claude.ai artifact page) becomes a standalone Vite + TypeScript app in this repo."
LastUpdated: 2026-11-21T19:21:39.496523492-05:00
WhatFor: ""
WhenToUse: ""
---

# TypeScript standalone port plan

## What we start from

The imported archive (`sources/candela/`, original zip at `~/data/pbr-spark/candela-workspace.zip`) is
**Candela**, a physically based rendering workbench:

- `src/` (~4.8k dense lines of ES modules): units, diagnostics, the `fx` expression graph traced into WGSL,
  params, fluent scene builders, stdlib materials, fragments, the compiler, the WGSL path-tracing kernel, a
  WGSL→GLSL translator, WebGPU/WebGL2 renderers, viewport, IR, meshes/BLAS, HDRIs, finishes, EXR/ZIP output,
  WebCodecs video.
- `app/` (~2.4k lines, React via globals): the tiling workbench (host, dock, code editor, params, panels,
  render queue, notes, agent).
- `content/`: 105 presets (`.md` notes + `.js` scene), docs, the API reference; `content/gen/*.py` generated them.
- `build/build.js`: esbuild bundles `app/main.jsx` into an IIFE and inlines React/KaTeX (from cdnjs or `vendor/`)
  plus all content as `window.CANDELA_DATA` into one HTML file meant to be published as a claude.ai artifact.

Platform coupling to claude.ai, all in `app/`:

| where | what | standalone replacement |
| --- | --- | --- |
| `ui/agent.jsx` | `window.claude.use('sample')` — a hosted tool-use loop with `limits()` | direct Anthropic Messages API client in the browser (user-supplied API key, stored locally), same `sample(turns, opts)` shape |
| `ui/common.jsx` `saveFile` | `window.claude.use('downloads')` | plain `<a download>` |
| `main.jsx` | `.exr` etc. wrapped in a `.zip` because artifacts may only save some types | removed: save files as-is |
| `build/build.js` | content inlined as `window.CANDELA_DATA` | `src/content/catalog.ts` + `import.meta.glob(?raw)` |
| globals | `React`, `ReactDOM`, `katex` from script tags | npm packages, ES imports |

## Target layout (repo root)

```
index.html                 Vite entry
vite.config.ts             dist/ (multi-file) or --mode single → dist-single/index.html (one file, like the original)
src/engine/*.ts            the library (from src/*.js)
src/app/*.ts(x)            the workbench (from app/)
src/content/               catalog.ts (frontmatter/presets/docs), browser.ts (Vite glob), node.ts (fs)
content/                   presets, docs, reference, gen/ (unchanged; scene files stay JavaScript — they are user code run by the engine's module loader)
scripts/validate.ts        build every preset in Node (port of test/validate.js)
scripts/shot.ts            headless Chromium screenshot of dist/ (port of test/shot.js)
tools/lockstitch/          the lockstitch converter/renderer (copied)
spec/                      the API spec (copied)
```

## Typing strategy

The code is dense, dynamic JS (proxies for the `fx` DSL, builders that grow objects, symbols as brands).
A rewrite would risk behaviour; the goal is a faithful port that typechecks.

1. **Mechanical port** — rename, fix imports, replace globals; `tsc` runs with `strict` but
   `noImplicitAny: false`. Runtime must match the original exactly (validate output diff = empty).
2. **Make tsc pass** — declare class fields, type empty containers, mark optional parameters, add interfaces for
   the main contracts (diagnostics, quantities, components, compiled scene, backends, host/view state).
3. **Tighten** — turn on `noImplicitAny` per module where it pays off (units, diag, catalog, output, video,
   agent client) and keep `any` where the DSL is genuinely dynamic (fx proxies, builder method tables).

## Validation gates

- `npm run typecheck` — zero errors.
- `npm run validate` — 105/105 presets build and translate to GLSL; output identical to the original
  (baseline: `various/01-baseline-validate-original-js.txt`).
- `npm run build` and `scripts/shot.ts` — the workbench boots in headless Chromium (WebGL2 and WebGPU via
  SwiftShader) with no console errors.
