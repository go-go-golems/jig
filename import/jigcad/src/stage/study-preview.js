// Study tracks give absolute component placements. The compiled markers are in
// the home pose's world frame, so move them by sample * inverse(home).
import { applyM, applyDir, mulM } from './math.js';

function inversePlacement(m) {
  const inv = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
  const t = applyDir(inv, [-m[12], -m[13], -m[14]]);
  inv.splice(12, 3, ...t);
  return inv;
}

export function studyAssembly(assembly, { pose, row, drive }) {
  const delta = new Map();
  const origins = { ...assembly.origins };
  for (const { id, transform } of assembly.components) {
    const world = pose[id];
    if (!world) continue; // a nested study can move just one subassembly
    delta.set(id, mulM(world, inversePlacement(transform)));
    origins[id] = [world[12], world[13], world[14]];
  }
  const move = ref => delta.get(ref?.split(':')[0]);
  const ports = assembly.ports.map(port => {
    const m = move(port.ref);
    return { ...port, o: applyM(m, port.o), x: applyDir(m, port.x), z: applyDir(m, port.z) };
  });
  const joints = assembly.joints.map(joint => {
    const a = move(joint.portA), b = move(joint.portB);
    return { ...joint,
      at: joint.at && applyM(a, joint.at), atB: joint.atB && applyM(b, joint.atB),
      axis: joint.axis && applyDir(a, joint.axis), slideAxis: joint.slideAxis && applyDir(a, joint.slideAxis),
      value: joint.id === drive ? row.x : null, slide: null,
    };
  });
  // Only the compiled pose has a mobility basis. Sampled point measures
  // supply the current position markers on study paths.
  return { ...assembly, ports, joints, origins, measures: row, mobility: {} };
}
