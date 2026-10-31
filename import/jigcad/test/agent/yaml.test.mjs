// node --test test/agent/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yaml, yamlInline, num, str } from '../../src/agent/yaml.js';

test('numbers round to 5 decimals; NaN and Infinity are words; -0 is 0', () => {
  assert.equal(num(0.987654321), '0.98765');
  assert.equal(num(72000), '72000');
  assert.equal(num(NaN), 'NaN');
  assert.equal(num(-Infinity), '-Infinity');
  assert.equal(num(-0.000001), '0');
});

test('strings: bare when plain, quoted when they would read as another type, | block with newlines', () => {
  assert.equal(str('box/body1'), 'box/body1');
  assert.equal(str('body/side[base.l1]'), 'body/side[base.l1]');
  assert.equal(str('fillet2/face[body/side[base.l1] ∩ body/end]'), 'fillet2/face[body/side[base.l1] ∩ body/end]');
  assert.equal(str('72000 mm³'), '72000 mm³');
  assert.equal(str('12'), '"12"');
  assert.equal(str('true'), '"true"');
  assert.equal(str(''), '""');
  assert.equal(str('a: b'), '"a: b"');
  assert.equal(str('- dash'), '"- dash"');
  assert.equal(str('x = { a }'), '"x = { a }"');
  assert.equal(yaml({ s: 'one\ntwo' }), 's: |\n  one\n  two');
});

test('typed arrays are summarised; number lists sit on one line and are cut at 64', () => {
  assert.equal(yaml({ positions: new Float32Array(3600), idx: new Uint32Array(12) }), 'positions: Float32Array(3600)\nidx: Uint32Array(12)');
  assert.equal(yaml([1, 2.123456789, 3]), '[1, 2.12346, 3]');
  const long = yaml(Array.from({ length: 100 }, (_, i) => i));
  assert.match(long, /^\[0, 1, .*, 63, … 100 items\]$/);
  assert.equal(yaml(new ArrayBuffer(84)), 'ArrayBuffer(84 bytes)');
});

test('lists and objects: block form, cut at 60 items and 80 keys', () => {
  assert.equal(yaml([{ gesture: 'a', score: 1 }, { gesture: 'b', score: 2 }]), '- gesture: a\n  score: 1\n- gesture: b\n  score: 2');
  const items = yaml(Array.from({ length: 65 }, (_, i) => 'x' + i));
  assert.match(items, /- x59\n# … 5 more$/);
  const o = {}; for (let i = 0; i < 85; i++) o['k' + i] = i;
  assert.match(yaml(o), /k79: 79\n# … 5 more keys$/);
  assert.equal(yaml({ kept: { states: 37 }, warnings: [] }), 'kept:\n  states: 37\nwarnings: []');
  assert.equal(yaml({ a: [{ b: [1, 2] }] }), 'a:\n  - b: [1, 2]');
});

test('depth, circular references, Maps, Sets, functions, handles', () => {
  const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
  assert.match(yaml(deep), /e: \{…\}/);
  const c = { name: 'c' }; c.self = c;
  assert.equal(yaml(c), 'name: c\nself: [circular]');
  const shared = { x: 1 };
  assert.equal(yaml([shared, shared]), '- x: 1\n- x: 1');
  assert.equal(yaml(new Map([['a', 1]])), 'a: 1');
  assert.equal(yaml(new Set(['axo', 'grid'])), '- axo\n- grid');
  assert.equal(yaml({ f: function run() {} }), 'f: [function run]');
  class Node { constructor() { this.kind = 'extrude'; this.id = 'body'; } }
  assert.equal(yaml(new Node()), 'extrude body');
  assert.equal(yaml({ kind: 'extrude', id: 'body', level: 'L1' }), 'kind: extrude\nid: body\nlevel: L1');
});

test('deterministic and top-level strings pass through', () => {
  const v = { b: 2, a: [1, { z: 'q', y: null, u: undefined }], d: new Date(0) };
  assert.equal(yaml(v), yaml(structuredClone ? { ...v } : v));
  assert.equal(yaml(v), 'b: 2\na:\n  - 1\n  - z: q\n    y: null\n    u: undefined\nd: 1970-01-01T00:00:00.000Z');
  assert.equal(yaml('line 1\nline 2'), 'line 1\nline 2');
  assert.equal(yaml(undefined), 'undefined');
});

test('inline YAML for logs', () => {
  assert.equal(yamlInline({ ok: true, errors: [], summary: { faces: 11 } }), '{ ok: true, errors: [], summary: { faces: 11 } }');
  assert.equal(yamlInline([1, 2]), '[1, 2]');
  assert.equal(yamlInline('plain'), 'plain');
});
