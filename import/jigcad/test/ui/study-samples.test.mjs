import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceStudy } from '../../src/ui/study-samples.js';

test('slow display frames stop at the first unavailable row, including a joint limit', () => {
  const reached = new Set([0, 1, 2, 4, 5, 6]);
  assert.deepEqual(advanceStudy(reached, 0, 6, 6, false), { row: 2, gap: 3 });
  assert.deepEqual(advanceStudy(reached, 2, 2, 6, false), { row: 2, gap: 3 });
  assert.deepEqual(advanceStudy(reached, 4, 2, 6, false), { row: 6, gap: null });
});

test('descending drive values advance in original sample order', () => {
  const values = [5, 2, -1, -4];
  const reached = new Set([0, 1, 2, 3]);
  const { row, gap } = advanceStudy(reached, 0, 2, 3, false);
  assert.equal(gap, null);
  assert.equal(values[row], -1);
});

test('Loop visits both endpoints, wraps on the next step, and tolerates dropped frames', () => {
  const reached = new Set([0, 1, 2, 3]);
  assert.deepEqual(advanceStudy(reached, 2, 1, 3, true), { row: 3, gap: null });
  assert.deepEqual(advanceStudy(reached, 3, 1, 3, true), { row: 0, gap: null });
  assert.deepEqual(advanceStudy(reached, 3, 1000002, 3, true), { row: 1, gap: null });
  assert.deepEqual(advanceStudy(reached, 1, 1000002, 3, false), { row: 3, gap: null });
});

test('Loop holds the last valid pose for a gap at either boundary or after wrapping', () => {
  const advance = (rows, from) => advanceStudy(new Set(rows), from, 100, 4, true);
  assert.deepEqual(advance([0, 1, 2, 3], 2), { row: 3, gap: 4 });
  assert.deepEqual(advance([1, 2, 3, 4], 2), { row: 4, gap: 0 });
  assert.deepEqual(advance([0, 2, 3, 4], 3), { row: 0, gap: 1 });
});
