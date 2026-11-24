import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceStudy } from '../../src/ui/study-samples.js';

test('slow display frames stop at the first unavailable row, including a joint limit', () => {
  const reached = new Set([0, 1, 2, 4, 5, 6]);
  assert.deepEqual(advanceStudy(reached, 0, 6), { row: 2, gap: 3 });
  assert.deepEqual(advanceStudy(reached, 2, 4), { row: 2, gap: 3 });
  assert.deepEqual(advanceStudy(reached, 4, 6), { row: 6, gap: null });
});

test('descending drive values advance in original sample order', () => {
  const values = [5, 2, -1, -4];
  const reached = new Set([0, 1, 2, 3]);
  const { row, gap } = advanceStudy(reached, 0, 2);
  assert.equal(gap, null);
  assert.equal(values[row], -1);
});
