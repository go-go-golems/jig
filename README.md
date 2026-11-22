# Candela (TypeScript, standalone)

A physically based rendering workbench: a fluent, unit-aware JavaScript API for scenes and engines, compiled to a
progressive path tracer that runs on **WebGPU** (compute) or **WebGL2** (fragment), in a tiling React workbench
with params as sliders, IR/graph/shader views, physical diagnostics, a render queue (PNG, EXR passes, MP4/WebM)
and a chat agent that drives the API.

This is the standalone TypeScript port of the Candela workspace that originally shipped as a single claude.ai
artifact page. The import, the porting decisions and a step-by-step diary are in the docmgr ticket
[`CANDELA-001`](ttmp/2026/11/21/CANDELA-001--standalone-typescript-port-of-the-candela-pbr-workspace/index.md);
the original sources are under that ticket's `sources/candela/`.

## Quick start

```sh
npm install
npm run dev            # http://localhost:5173 — the workbench
npm run build          # → dist/ (index.html + assets)
npm run build:single   # → dist-single/index.html, one self-contained file (opens from file://)
```

Open a preset directly with its id in the hash: `http://localhost:5173/#K-01`.

## Checks

| command | what it checks |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` over everything (`strict`, `noImplicitAny` off) |
| `npm run typecheck:strict` | the ratchet: files listed in `scripts/typecheck-strict.ts` must also pass `noImplicitAny` |
| `npm run validate [IDs…]` | builds every preset in Node (no GPU): diagnostics, stats, WGSL→GLSL translation |
| `npm test` | the agent's tool loop against a scripted fake API (no network, no key) |
| `npm run shot -- <ID> <out.png> [w h waitMs light\|dark webgl2\|webgpu]` | screenshots `dist/` in headless Chromium (SwiftShader) and prints console errors; `CLICK=Agent` clicks UI text first |

`npm run validate` reproduces the original JavaScript's output exactly (baseline in the ticket's `various/`).

## Layout

| path | what |
| --- | --- |
| `src/engine/` | the library: units, diagnostics, the `fx` expression graph, params, scene builders, stdlib materials, fragments, compiler, WGSL kernel, WGSL→GLSL, WebGPU/WebGL2 renderers, viewport, IR, meshes/BLAS, HDRIs, finishes, EXR/ZIP output, WebCodecs video |
| `src/app/` | the workbench (React 18): `host.ts` (state, build, clock, picking), `ui/*` views, `claude.ts` (the agent's model connection), markdown/highlighting |
| `src/content/` | `catalog.ts` turns `content/` into presets/docs/reference; `browser.ts` (Vite `import.meta.glob`) and `node.ts` (fs) feed it |
| `content/presets/` | 105 presets: `<ID>-<slug>.md` (notes, frontmatter) + `.js` (the scene, run by the engine's own module loader — scene files stay JavaScript) + optional `<ID>-<slug>/` lib files |
| `content/docs/`, `content/reference.md` | the docs and the API reference (also the agent's reference) |
| `content/gen/` | the Python scripts that generated the presets |
| `scripts/`, `tests/` | validation, screenshots, typing ratchet, agent loop test |
| `tools/lockstitch/` | the lockstitch-head converter and renderer (from the original workspace; not yet ported to TS) |
| `spec/` | the API design spec |

## The agent

The Agent view talks to Claude through the Anthropic TypeScript SDK, called from the browser. Open
**Agent → Connection** and enter an Anthropic API key, or the base URL of a proxy that adds the key server-side.
The key is stored in this browser's `localStorage` and sent only to the API (or the proxy) — fine for a local
tool, but do not host a public build with a key configured. Model tiers: Fast `claude-haiku-5-5`, Balanced and
Deep `claude-opus-5-5` (Deep at higher effort); each is overridable in the form.

The agent has two tools: `eval` (runs JavaScript in the page with the Candela API and the workbench in scope) and
`screenshot` (the viewport or the whole workbench, sent back to it as an image).

## Differences from the artifact build

- React, ReactDOM and KaTeX come from npm instead of script tags; content is bundled by Vite instead of being
  inlined as `window.CANDELA_DATA`.
- The agent uses your API key instead of the artifact's `sample` capability.
- Files are saved as ordinary downloads (no `.zip` wrapping of `.exr`/video files).
