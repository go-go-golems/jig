// candela.js: the Candela engine as one ES module (dist/candela.js) for the Render view and for Node tests: the
// non-DOM core (build, compile, sessions; the same source candela-rt runs from dist/candela-core.js) and the
// browser layer (Viewport, renderers, render queue). One module, so the engine's registries (params, fragments)
// exist once. The page loads it on demand; Node can import it too (nothing here touches the DOM at load time).
// Source: vendor/candela (tools/vendor-candela.sh; VERSIONS names the pbr-spark commit).
export * from '../../vendor/candela/src/engine/core.ts';
export { API, paramStore, formatDiag, compile } from '../../vendor/candela/src/engine/candela.ts';
export { Viewport } from '../../vendor/candela/src/engine/viewport.ts';
export { RenderQueue, runRender, passesToEXR, writeEXR, readEXR } from '../../vendor/candela/src/engine/output.ts';
export { videoSupport } from '../../vendor/candela/src/engine/video.ts';
