// Joints picked on the sheet (assembly spec, workbench views): a face or an edge selected on the stage becomes a
// joint end, j.on(component, j.sel.names(kind, [name])), and a joint between two ends is written into the script
// after its last .joint( (or .add() call. Pure functions, so the Mechanism view and the tests share them.

// the component a selected body belongs to: program body ids are '<component>/<body>' (the longest component id
// that prefixes it, so a subassembly's 'hook/shaft/body' finds 'hook/shaft')
export function componentOf(bodyId, componentIds) {
  let best = null;
  for (const c of componentIds) if (String(bodyId).startsWith(c + '/') && (!best || c.length > best.length)) best = c;
  return best;
}

// a selection on the stage → a joint end { comp, kind, name, code }, or null when it is not a face or an edge of a
// component of this assembly
export function endFromSelection(sel, program) {
  const A = program?.assembly;
  if (!sel || !A || sel.body == null || !sel.name) return null;
  // the host keeps the body as an index into program.bodies; the stage's own picks carry its id
  const bodyId = typeof sel.body === 'number' ? program.bodies?.[sel.body]?.id : sel.body;
  const comp = bodyId != null && componentOf(bodyId, (A.components || []).map((c) => c.id));
  if (!comp) return null;
  const kind = sel.edge != null ? 'edges' : sel.face != null ? 'faces' : null;
  if (!kind) return null;
  return { comp, kind, name: sel.name, code: `j.on('${comp}', j.sel.names('${kind}', [${JSON.stringify(sel.name)}]))` };
}

export const JOINT_KINDS = ['revolute', 'slider', 'cylindrical', 'pinSlot', 'rigid', 'planar', 'ball'];

// the next free joint id: j1, j2, …
export function nextJointId(program) {
  const used = new Set((program?.assembly?.joints || []).map((j) => j.id));
  let k = 1; while (used.has(`j${k}`)) k++;
  return `j${k}`;
}

export function jointCode({ id, kind, a, b, asBuilt }) {
  return `.joint('${id}', j.joint.${kind}(${asBuilt ? '{ asBuilt: true }' : ''}), ${a.code}, ${b.code})`;
}

// insert a chained call after the script's last .joint( call (else its last .add( call), with that line's
// indentation; null when the script has neither
export function insertJoint(script, line) {
  const lines = String(script).split('\n');
  const find = (re) => { for (let i = lines.length - 1; i >= 0; i--) if (re.test(lines[i])) return i; return -1; };
  let at = find(/^\s*\.joint\(/);
  if (at < 0) at = find(/^\s*\.add\(/);
  if (at < 0) return null;
  // a call can run over several lines: go on until its parentheses close
  let depth = 0, end = at;
  for (let i = at; i < lines.length; i++) {
    depth += parens(lines[i]); end = i;
    if (depth <= 0) break;
  }
  const indent = /^(\s*)/.exec(lines[at])[1];
  lines.splice(end + 1, 0, indent + line);
  return lines.join('\n');
}
// ( minus ) on a line, outside quotes and line comments
function parens(s) {
  let d = 0, q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '/' && s[i + 1] === '/') break;
    if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '(') d++;
    else if (c === ')') d--;
  }
  return d;
}
