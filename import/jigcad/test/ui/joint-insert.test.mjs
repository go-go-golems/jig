// Joints picked on the sheet: a selection becomes a joint end, and the joint goes into the script after its
// last .joint( call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentOf, endFromSelection, jointCode, insertJoint, nextJointId } from '../../src/ui/joint-insert.js';

const program = { assembly: { components: [{ id: 'plate' }, { id: 'arm' }, { id: 'hook' }, { id: 'hook/shaft' }], joints: [{ id: 'j1' }] } };

test('a selected face or edge is a joint end on its component', () => {
  assert.equal(componentOf('hook/shaft/body', ['hook', 'hook/shaft']), 'hook/shaft');
  const a = endFromSelection({ body: 'plate/body', face: 3, name: 'body/side[s.h]' }, program);
  assert.deepEqual(a, { comp: 'plate', kind: 'faces', name: 'body/side[s.h]', code: `j.on('plate', j.sel.names('faces', ["body/side[s.h]"]))` });
  const e = endFromSelection({ body: 'arm/body', face: null, edge: 7, name: 'edge:body/end|body/side[s.h]' }, program);
  assert.equal(e.kind, 'edges');
  assert.equal(endFromSelection({ body: 'other/body', face: 1, name: 'x' }, program), null);
  assert.equal(endFromSelection({ body: 1, face: 2, name: 'body/end' }, { ...program, bodies: [{ id: 'plate/body' }, { id: 'arm/body' }] }).comp, 'arm');
  assert.equal(endFromSelection({ sketch: 's', entity: 'l1' }, program), null);
  assert.equal(nextJointId(program), 'j2');
});

test('the joint goes after the last .joint( call, a multi-line one included', () => {
  const a = { code: "j.on('plate', j.sel.names('faces', [\"f\"]))" }, b = { code: "j.on('arm', j.sel.names('faces', [\"g\"]))" };
  const line = jointCode({ id: 'j2', kind: 'revolute', a, b, asBuilt: true });
  assert.equal(line, `.joint('j2', j.joint.revolute({ asBuilt: true }), ${a.code}, ${b.code})`);
  const script = [
    "return j.assembly('x')",
    "  .add('plate', plate, { ground: true }).add('arm', arm)",
    "  .joint('j1', j.joint.rigid(),",
    "    'plate:a', 'arm:b')   // a comment with a ( in it",
    "  .drive('j1', deg(3))",
  ].join('\n');
  const out = insertJoint(script, line).split('\n');
  assert.equal(out[4], '  ' + line);
  assert.equal(out[5], "  .drive('j1', deg(3))");
  const noJoint = insertJoint("return j.assembly('x')\n  .add('a', a)\n  .add('b', b)", line).split('\n');
  assert.equal(noJoint[3], '  ' + line);
  assert.equal(insertJoint("return j.part('p')", line), null);
});
