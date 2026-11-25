// Run from the Jig repository root. Exercise the same resolver and clipped meshes as Stage.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const jig = file => pathToFileURL(resolve('import/jigcad', file));
register(jig('test/engine/loader.mjs'));
const { handle } = await import(jig('src/engine/worker.js'));
const { normalizeShot, shotAt } = await import(jig('src/render/shot.js'));
const { shotGeometry } = await import(jig('src/stage/section.js'));
const { meshVolume } = await import(jig('src/stage/scene.js'));
const { program } = await handle({ op: 'compile', files: {
  'script.js': "return j.part('Sleeve').extrude(j.region.circle(10).subtract(j.region.circle(4)).on(j.plane.XY),mm(12))",
}});
assert.ok(program.ok);
const original = program.bodies[0];
const keys = normalizeShot([
  { time: 1, section: { components: [original.part], normal: [0, 0, 1], offset: 2, endOffset: 10, endTime: 5 } },
  { time: 8, section: null },
], 'sleeve');
for (const [t, height] of [[5, 10], [1, 2], [3, 6], [7, 10]]) {
  const clipped = shotGeometry(program, shotAt(keys, t)).bodies[0];
  const cap = clipped.faces[clipped.sectionCapFace];
  assert.ok(Math.abs(cap.center[2] - height) < 1e-4);
  assert.ok(Math.abs(cap.area / (Math.PI * 84) - 1) < 0.012);
  const fraction = meshVolume(clipped.mesh) / meshVolume(original.mesh);
  assert.ok(Math.abs(fraction - height / 12) < 1e-5);
  console.log({ t, height, capArea: cap.area, retainedVolumeFraction: fraction });
}
assert.strictEqual(shotGeometry(program, shotAt(keys, 8)).bodies[0], original);
assert.equal(original.sectionCapFace, undefined);
