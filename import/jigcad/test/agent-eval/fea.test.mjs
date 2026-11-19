// A stress study through the agent's scope on the real Host and engine (spec v0.2, layer 6): the compile returns the
// part with the solve pending, the host starts the solve, and fea.result() waits for that same solve rather than
// starting a second one. Needs a mesher: the TetGen module in vendor/fea, or JIG_TETGEN naming a native tetgen.
// node --test test/agent-eval/fea.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register(new URL('../../tools/agent-eval/loader.mjs', import.meta.url).href);
const { createNodeEngine } = await import('../../tools/agent-eval/node-engine.mjs');
const { Host } = await import('../../src/host/host.js');
const { labScope } = await import('../../src/agent/scope.js');
const { available } = await import('../../src/fea/backends.js');

const have = await available();
const skip = have.tetgen ? false : 'no TetGen: build vendor/fea (tools/fea-wasm/build.sh) or set JIG_TETGEN';
const SCRIPT = readFileSync(new URL('../engine/scripts/52-fea-cantilever.js', import.meta.url), 'utf8');

test('fea.result() waits for the compile\'s own solve and answers in MPa, mm and N', { skip }, async () => {
  const engine = await createNodeEngine();
  const host = new Host({ engine });
  await engine.ready;
  let solves = 0;
  const request = engine.request.bind(engine);
  engine.request = (op, args) => { if (op === 'fea') solves++; return request(op, args); };

  await host.loadScratch({ 'script.js': SCRIPT }, { title: 'cantilever' });   // opening compiles, and starts a solve
  solves = 0;
  const scope = labScope(host, {});
  const compiled = await scope.run();
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors ?? compiled));
  const r = await scope.fea.result();
  assert.equal(r.status, 'solved');
  assert.equal(solves, 1, 'the agent shares the solve the compile started');

  // Euler–Bernoulli: σ = F L c / I = 20·60·3 / (6⁴/12) = 33.3 MPa at the root (the nodal peak sits a little above it)
  assert.ok(r.peak.value > 30 && r.peak.value < 60, `peak ${r.peak.value}`);
  assert.ok(Math.abs(r.safetyFactor - 250 / r.peak.value) < 1e-6 * r.safetyFactor);
  // Timoshenko: F L³/3EI + F L/κGA = 0.0667 + 0.0005 mm at the tip
  assert.ok(r.displacement.value > 0.066 && r.displacement.value < 0.068, `tip ${r.displacement.value} mm`);
  assert.ok(r.displacement.faces.includes('body/end'));
  // balanced to the solver's precision: CalculiX's .dat prints 7 significant digits a node
  const tol = /CalculiX/.test(r.solver) ? 1e-5 : 1e-6;
  assert.ok(Math.abs(r.balance) < tol, `balance ${r.balance}`);
  assert.ok(Math.abs(r.reaction[2] / 20 - 1) < tol, `reaction ${r.reaction}`);
  assert.equal(r.material, 'steel');
  assert.ok(r.faces.length > 0 && r.faces[0].max >= r.faces.at(-1).max);
  assert.equal(host.program.metrics.safetyFactor.value, r.safetyFactor);

  const faces = await scope.fea.faces();
  assert.ok(faces.length >= 6 && faces.every(f => typeof f.name === 'string' && f.max >= f.mean));
  assert.equal(solves, 1, 'a solved study is not solved again');

  // a compile that is not a stress study: the call says so and names itself
  host.setFile('script.js', "return j.part('p').extrude(j.sketch('s').rect('r', 10, 10).profiles(), mm(5))");
  await scope.run();
  await assert.rejects(scope.fea.faces(), /^Error: fea\.faces: the open program is not a stress study/);
});

test('the sandbox bridges fea.result() to the page, and its mirror then holds the solved study', { skip }, async () => {
  const { createNodeSandbox } = await import('../../src/agent/sandbox/node.js');
  const { runInSandbox } = await import('../../src/agent/sandbox/client.js');
  const engine = await createNodeEngine();
  const host = new Host({ engine });
  await engine.ready;
  await host.loadScratch({ 'script.js': SCRIPT }, { title: 'cantilever' });
  const sb = createNodeSandbox();
  try {
    const out = await runInSandbox(sb, host, `const r = await fea.result()
return { status: r.status, sf: Math.round(r.safetyFactor * 10) / 10, top: (await fea.faces())[0].name, sfMetric: program.metrics('safetyFactor').safetyFactor > 0 }`, { timeoutMs: 120000 });
    assert.match(out.text, /status: solved/, out.text);
    assert.match(out.text, /top: body\/side\[s\.r\.(top|bottom)\]/, out.text);
    assert.match(out.text, /sfMetric: true/, out.text);
  } finally { sb.close(); }
});
