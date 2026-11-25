// Row numbers follow authored order, even in a descending drive. Check each
// crossed row so a slow display cannot jump over a gap or a joint limit.
export function advanceStudy(indices, current, steps, last, loop) {
  const count = last + 1;
  const target = current + steps;
  const row = loop ? target % count : Math.min(target, last);
  // After visiting a full cycle all subsequent cycles have the same gaps.
  const crossed = loop ? Math.min(steps, count) : row - current;
  let previous = current;
  for (let i = 1; i <= crossed; i++) {
    const next = (current + i) % count;
    if (!indices.has(next)) return { row: previous, gap: next };
    previous = next;
  }
  return { row, gap: null };
}
