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

// A presentation inserts a three-second spread, a one-second inspection hold,
// and a three-second return before the solved study. Each sample is 1/24 s.
export function presentationSample(index) {
  const travel = 72, hold = 24, intro = travel * 2 + hold;
  const source = Math.max(0, index - intro);
  const fraction = Math.max(0, Math.min(1, index / travel, (intro - index) / travel));
  const spread = fraction * fraction * (3 - 2 * fraction);
  const label = index < travel ? 'Explode' : index <= travel + hold ? 'Full spread' : 'Reassemble';
  return { source, spread, label: index < intro ? label : '', intro };
}
