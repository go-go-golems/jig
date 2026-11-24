// Walk the original row numbers so a dropped animation frame cannot skip an
// unreachable interval. The track matrices are packed by reached row only.
export function advanceStudy(indices, current, target) {
  for (let next = current + 1; next <= target; next++) {
    if (!indices.has(next)) return { row: next - 1, gap: next };
  }
  return { row: target, gap: null };
}
