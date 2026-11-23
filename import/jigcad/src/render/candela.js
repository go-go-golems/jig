// candela.js: the Candela engine as one ES module (dist/candela.js) for the Render view and for Node tests: the
// non-DOM core (build, compile, sessions; the same source candela-rt runs from dist/candela-core.js) and the
// browser layer (Viewport, renderers, render queue). One module, so the engine's registries (params, fragments)
// exist once. The page loads it on demand; Node can import it too (nothing here touches the DOM at load time).
// Source: import/candela/src/engine, Candela's own tree inside jig (JIG-017).
export * from '../../../candela/src/engine/core.ts';
export { API, paramStore, formatDiag, compile } from '../../../candela/src/engine/candela.ts';
export { Viewport } from '../../../candela/src/engine/viewport.ts';
export { RenderQueue, runRender, passesToEXR, writeEXR, readEXR } from '../../../candela/src/engine/output.ts';
export { videoSupport } from '../../../candela/src/engine/video.ts';
export { rayMesh } from '../../../candela/src/engine/mesh.ts';   // picking against CAD meshes (render/host.js)
