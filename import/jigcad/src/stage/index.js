// jigcad stage: the drafting-sheet view of a ProgramData, after the Form Skate Stage design system.
//
//   renderSheet(canvas, program, view, options) → { width, height, ms }
//     view: 'axo' | 'front' | 'side' | 'plan' | 'sketch', or { name, yaw, pitch, zoom, pan, scale, target, sketch }
//     options: { width, height, dpr, overlays, selection, hover, sheet, titleBlock, theme, colorsFrom, sketches }
//   createStage(element, host) → { setProgram, setView, getView, overlays, setOverlay, squareUp, redraw, toPNG, destroy }
export { renderSheet, draw, OVERLAYS, DEFAULT_OVERLAYS, activeSketch } from './sheet.js';
export { createStage } from './stage.js';
export { VIEWS, VIEW_KEYS, SUN, makeCam, proj, depth, fitScale, viewCam, nearestView } from './camera.js';
export { readColors, loadFonts, onTheme, PALETTE, K as TOKENS } from './theme.js';
export { sceneOf, meshTopology, meshVolume } from './scene.js';
export { sketchStatus, handles as sketchHandles, sketchCam } from './sketch.js';
