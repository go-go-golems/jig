// A work area selects output frame indices from the same 24 fps clock as a full export.
export const STAGE_FPS = 24;
export function outputFrames(study) { return Math.max(2, Math.round(study.seconds * STAGE_FPS)); }
export function outputRow(study, frame) {
  const count = outputFrames(study);
  return Math.round(frame * study.last / (study.cyclic ? count : count - 1));
}
export function isWorkArea(first, last, count) {
  return Number.isInteger(first) && Number.isInteger(last) && first >= 0 && last >= first && last < count;
}

// A gap outside a selected interval does not invalidate its reachable samples.
export function reachableWorkArea(study, first, last) {
  if (!study || study.complete) return true;
  const rows = new Set(study.rows);
  for (let i = first; i <= last; i++) if (!rows.has(outputRow(study,i))) return false;
  return true;
}
