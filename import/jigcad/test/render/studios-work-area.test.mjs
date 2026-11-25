import assert from 'node:assert/strict';
import test from 'node:test';
import { isWorkArea, outputFrames, outputRow, reachableWorkArea } from '../../src/render/work-area.js';
import { inspectionStudio, projectStudio, readStudios, validateStudio, writeStudios } from '../../src/render/studios.js';
import { modelFiles } from '../../src/render/files.js';

test('work area indexes the original output schedule, including gaps and endpoint policy', () => {
  const study = { seconds: 1, last: 48, cyclic: true, complete: true };
  assert.equal(outputFrames(study), 24);
  assert.equal(outputRow(study, 23), 46);
  assert.equal(outputRow({ ...study, cyclic: false }, 23), 48);
  assert.ok(isWorkArea(5, 5, 24));
  assert.ok(!isWorkArea(19, 18, 24));
  assert.ok(!isWorkArea(0, 24, 24));
  const gapped = { ...study, rows: [10,12], complete: false };
  assert.ok(reachableWorkArea(gapped, 5, 6));
  assert.ok(!reachableWorkArea(gapped, 4, 6));
});

test('named scene source, modules and exposure survive save, switch and removal', () => {
  const files = new Map([['script.js', 'return part'], ['look.js', 'first'], ['finish.look.js', 'export const finish = 1']]);
  const host = { setFile: (key, text) => files.set(key, text) };
  const original = projectStudio(files, 'unused');
  const second = validateStudio({ source: 'second', ev: 0 });
  const entries = new Map([['A', original], ['B', second]]);
  writeStudios(host, entries, 'B');
  assert.deepEqual(readStudios(files), { active: 'B', entries });
  assert.deepEqual(modelFiles(files), { 'script.js': 'return part' });
  assert.deepEqual(original.modules, { 'finish.look.js': 'export const finish = 1' });
  entries.delete('B'); writeStudios(host, entries, 'A');
  assert.deepEqual(readStudios(files), { active: 'A', entries });
  assert.throws(() => validateStudio({ source: 'x', ev: Infinity }));
  assert.throws(() => validateStudio({ source: 'x', modules: {'../outside.look.js': ''} }));
  assert.throws(() => inspectionStudio({top:'#abcdef',bottom:'#123456',materialColor:'#111111',illuminance:-1,address:''}));
});
