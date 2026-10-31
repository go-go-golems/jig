// The stage (src/stage/index.js) and the agent panel (src/agent/panel.jsx) are built by other owners. They are
// imported through a template so the bundle builds before they exist (esbuild bundles whatever matches and warns
// on an empty match); until then the views use the fallbacks here.
import { createFallbackStage, renderSheetFallback } from './sheet.js';

let stageMod = null, agentMod = null;

export async function loadStage() {
  if (stageMod) return stageMod;
  const name = 'index';
  try {
    const m = await import(`../stage/${name}.js`);
    if (typeof m.createStage === 'function') {
      // a stage that throws while it is being built falls back to the plain sheet, with a warning
      const createStage = (el, host) => {
        try { const st = m.createStage(el, host); stageMod.fallback = false; return st; }
        catch (e) { console.warn('src/stage createStage failed; using the plain sheet:', e.message); stageMod.fallback = true; return createFallbackStage(el, host); }
      };
      const renderSheet = (canvas, program, view, options) => {
        try { return (m.renderSheet || renderSheetFallback)(canvas, program, view, options); }
        catch (e) { console.warn('src/stage renderSheet failed; using the plain sheet:', e.message); return renderSheetFallback(canvas, program, view, options); }
      };
      return (stageMod = { createStage, renderSheet, overlays: Array.isArray(m.OVERLAYS) ? m.OVERLAYS : null, fallback: false });
    }
  } catch (e) {
    if (!/not found in bundle|Cannot find module|Failed to fetch/i.test(e?.message || '')) console.warn('src/stage/index.js failed to load:', e);
  }
  return (stageMod = { createStage: createFallbackStage, renderSheet: renderSheetFallback, fallback: true });
}

export async function loadAgent() {
  if (agentMod) return agentMod;
  const name = 'panel';
  try {
    const m = await import(`../agent/${name}.jsx`);
    if (typeof m.AgentPanel === 'function') return (agentMod = { AgentPanel: m.AgentPanel });
  } catch (e) {
    if (!/not found in bundle|Cannot find module|Failed to fetch/i.test(e?.message || '')) console.warn('src/agent/panel.jsx failed to load:', e);
    return (agentMod = { AgentPanel: null, error: /not found in bundle/i.test(e?.message || '') ? null : e });
  }
  return (agentMod = { AgentPanel: null });
}
