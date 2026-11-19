import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

register(new URL('../../tools/agent-eval/loader.mjs', import.meta.url).href);
const { followLink } = await import('../../src/host/lab.js');

test('Notes links drive movable joints in their displayed units', () => {
  const calls = [];
  const host = {
    program: {
      params: [{ name: 'turn', unit: 'deg' }],
      assembly: { joints: [
        { id: 'turn', unit: '°', value: 0 },
        { id: 'travel', unit: 'mm', value: 0 },
      ] },
    },
    setOverride: (...args) => calls.push(['override', ...args]),
    focus: (...args) => calls.push(['focus', ...args]),
    toast: (...args) => calls.push(['toast', ...args]),
  };

  assert.equal(followLink(host, 'lab:joint/turn=5'), true);
  assert.equal(followLink(host, 'lab:joint/travel=1.5708'), true);
  assert.equal(followLink(host, 'lab:param/turn=3'), true);
  assert.equal(followLink(host, 'lab:show/mechanism'), true);
  assert.equal(followLink(host, 'lab:joint/missing=4'), false);
  assert.deepEqual(calls, [
    ['override', 'turn', '5 deg'], ['focus', 'mechanism'],
    ['override', 'travel', '1.5708 mm'], ['focus', 'mechanism'],
    ['override', 'turn', 3], ['focus', 'params', { param: 'turn' }],
    ['focus', 'mechanism'], ['toast', 'no movable joint missing', 'bad'],
  ]);
});
