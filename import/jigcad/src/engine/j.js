// The full `j` namespace: core's part (units, params, geom, patterns, sketches) + the kernel's part.
import { makeJCore } from './core.js';
import { part } from './part.js';
import * as csg from './csg.js';
import { sel, feat, on, Selector } from './select.js';
import { hole } from './holes.js';
import { fit, stack, registerProfile } from './fit.js';
import { region as kRegion } from './region.js';
import { material, snap, gearMesh, mobility } from './inspect.js';
import { compile as compileModel } from './program.js';
import { hashValue } from './hash.js';
import { printer, print, preset } from './print.js';
import { rules, rule, check } from './rules.js';
import { lib } from './lib.js';
import { assembly, joint } from './assembly.js';
import { design, param, search, objective, metric, evaluate, stage } from './explore.js';
import { laws, law, structure, gen } from './laws.js';
import { exportTo } from './io.js';
import { inspectApi } from './inspect-api.js';
import { sketch3d as kSketch3d } from './path3d.js';
import { Deferred, isDeferred } from './geom.js';

export const VERSION = 'jigcad-kernel 0.1 (OpenCascade 7.x wasm)';

export function makeJ() {
  const core = makeJCore();
  const j = { ...core };
  delete j.bare;
  Object.assign(j, {
    version: VERSION,
    part, box: csg.box, cyl: csg.cyl, sphere: csg.sphere, cone: csg.cone, torus: csg.torus,
    sel, feat, on, hole, fit, stack, material,
    region: core.region ?? kRegion,
    sketch3d: core.sketch3d ?? kSketch3d,
    printer, print, preset, rules, rule, check, lib, assembly, joint,
    design, param: { ...(core.param ?? {}), ...param }, search, objective, metric, evaluate, stage,
    laws, law, structure, gen,
    inspect: inspectApi, export: exportTo,
    compile: (m, o) => compileModel(m, o).keep(),
    hash: x => x?.data?.hash ?? 'h:' + hashValue(x),
    diff: (a, b) => diffModels(a, b),
    load: new Proxy({}, { get: (_, k) => () => { throw new Error(`j.load.${String(k)}: loading files is an effect not supported in this build; put data files in the preset and read them from \`data\``); } }),
    field: new Proxy({}, { get: (_, k) => () => { throw new Error(`j.field.${String(k)} is not supported by this kernel yet`); } }),
    mesh: () => { throw new Error('j.mesh is not supported by this kernel yet'); },
    isSelector: x => x instanceof Selector,
  });
  j.fit.profileRegister = registerProfile;
  // transforms and frames may take param expressions ('w / 2') and deferred points: they resolve at compile
  const lazy = v => typeof v === 'string' && !/^[+-]?[XYZ]$/i.test(v) || isDeferred(v) || (Array.isArray(v) && v.some(lazy));
  const coreTx = core.tx, coreFrame = core.frame;
  j.tx = Object.assign(Object.create(null), coreTx, {
    move: (...a) => a.some(lazy) ? new Deferred('tx', 'move', a) : coreTx.move(...a),
    rotate: (axis, angle) => lazy(axis) || lazy(angle) ? new Deferred('tx', 'rotate', [axis, angle]) : coreTx.rotate(axis, angle),
    scale: (...a) => a.some(lazy) ? new Deferred('tx', 'scale', a) : coreTx.scale(...a),
  });
  j.frame = Object.assign((o = {}) => [o.origin, o.x, o.z].some(lazy) ? new Deferred('frame', 'make', [o]) : coreFrame(o), coreFrame);
  return { j, bare: core.bare };
}
function diffModels(a, b) {
  const ia = new Map((a.items ?? []).map(f => [f.id, f])), ib = new Map((b.items ?? []).map(f => [f.id, f]));
  const added = [...ib.keys()].filter(k => !ia.has(k)).map(k => `${k} (${ib.get(k).type})`);
  const removed = [...ia.keys()].filter(k => !ib.has(k)).map(k => `${k} (${ia.get(k).type})`);
  const changed = [...ia.keys()].filter(k => ib.has(k) && hashValue(ia.get(k).args) !== hashValue(ib.get(k).args)).map(k => k);
  return { added, changed, removed };
}
