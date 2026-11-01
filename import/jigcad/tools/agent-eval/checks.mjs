// The check vocabulary of an evaluation case (JIG-003 design doc §5.3). A check is data: { kind, ...fields }.
// evaluate(c, state) → [{ kind, pass, detail }], where state = { initialFiles, files, program, turn, steps }.
// Unknown kinds fail with a detail that names them, so a typo in a case cannot pass silently.

const rx = p => new RegExp(p, 'i');
const fmt = v => (Array.isArray(v) ? `[${v.map(fmt).join(', ')}]` : typeof v === 'number' ? String(+v.toFixed(4)) : JSON.stringify(v));
const errorsOf = p => (p?.diagnostics || []).filter(d => d.level === 'error');

/** Compare a number (or array of numbers) against { approx, tol } | { equals, tol } | { min, max }. */
export function compareValue(value, spec) {
  const tol = spec.tol ?? 1e-6;
  const one = (v, want) => typeof v === 'number' && Math.abs(v - want) <= tol;
  if (spec.approx !== undefined || spec.equals !== undefined) {
    const want = spec.approx ?? spec.equals;
    if (Array.isArray(want)) return Array.isArray(value) && value.length === want.length && want.every((w, i) => one(value[i], w));
    return one(value, want);
  }
  if (typeof value !== 'number') return false;
  if (spec.min !== undefined && value < spec.min) return false;
  if (spec.max !== undefined && value > spec.max) return false;
  return true;
}
const wantText = spec => spec.approx !== undefined ? `≈ ${fmt(spec.approx)} ± ${spec.tol ?? 1e-6}`
  : spec.equals !== undefined ? `= ${fmt(spec.equals)}` : `in [${spec.min ?? '−∞'}, ${spec.max ?? '∞'}]`;

export const CHECKS = {
  compiles(_, s) {
    const errs = errorsOf(s.program);
    const ok = !!s.program && s.program.ok !== false && errs.length === 0;
    return [ok, ok ? 'compiles' : `errors: ${errs.map(e => `${e.kind}: ${e.message}`).join('; ') || 'program not ok'}`];
  },
  fails(c, s) {
    const errs = errorsOf(s.program);
    const ok = errs.length > 0 && (!c.diagnostic || errs.some(e => e.kind === c.diagnostic));
    return [ok, errs.length ? `errors: ${errs.map(e => e.kind).join(', ')}` : 'compiles without errors'];
  },
  file(c, s) {
    const text = s.files[c.path];
    if (text == null) return [false, `no file ${c.path}`];
    const bad = [];
    if (c.contains !== undefined && !text.includes(c.contains)) bad.push(`does not contain ${JSON.stringify(c.contains)}`);
    if (c.matches !== undefined && !rx(c.matches).test(text)) bad.push(`does not match /${c.matches}/`);
    if (c.notMatches !== undefined && rx(c.notMatches).test(text)) bad.push(`matches /${c.notMatches}/`);
    return [bad.length === 0, bad.join('; ') || `${c.path} as expected`];
  },
  unchanged(c, s) {
    const paths = c.paths || [...new Set([...Object.keys(s.initialFiles), ...Object.keys(s.files)])];
    const changed = paths.filter(p => s.initialFiles[p] !== s.files[p]);
    return [changed.length === 0, changed.length ? `changed: ${changed.join(', ')}` : 'files unchanged'];
  },
  metric(c, s) {
    const m = s.program?.metrics?.[c.name];
    if (!m) return [false, `no metric ${c.name}`];
    return [compareValue(m.value, c), `${c.name} ${fmt(m.value)} ${wantText(c)}`];
  },
  param(c, s) {
    const row = (s.program?.params || []).find(r => r.name === c.name || r.local === c.name);
    if (!row) return [false, `no param ${c.name}`];
    return [compareValue(row.value, c), `${c.name} ${fmt(row.value)} ${wantText(c)}`];
  },
  sketchDof(c, s) {
    const sk = (s.program?.sketches || []).find(x => x.id === c.id);
    if (!sk) return [false, `no sketch ${c.id}`];
    return [sk.dof === c.dof, `sketch ${c.id} dof ${sk.dof}, want ${c.dof}`];
  },
  answer(c, s) {
    const text = s.turn?.text || '';
    const bad = [];
    for (const p of [].concat(c.matches || [])) if (!rx(p).test(text)) bad.push(`missing /${p}/`);
    const any = [].concat(c.any || []);
    if (any.length && !any.some(p => rx(p).test(text))) bad.push(`none of ${any.map(p => `/${p}/`).join(' ')}`);
    for (const p of [].concat(c.notMatches || [])) if (rx(p).test(text)) bad.push(`has /${p}/`);
    return [bad.length === 0, bad.join('; ') || 'answer as expected'];
  },
  steps(c, s) {
    const n = s.steps.length;
    const ok = (c.min === undefined || n >= c.min) && (c.max === undefined || n <= c.max);
    return [ok, `${n} steps, want ${c.min ?? 0}–${c.max ?? '∞'}`];
  },
  stepCode(c, s) {
    const hit = s.steps.some(st => rx(c.matches).test(st.code || ''));
    return [hit, hit ? `a step matches /${c.matches}/` : `no step matches /${c.matches}/`];
  },
  noNote(_, s) {
    const note = s.turn?.note;
    const ok = !note || note === s.truncatedNote;
    return [ok, ok ? 'no note' : `note: ${note}`];
  },
};

export function evaluate(c, state) {
  return (c.checks || []).map(ch => {
    const fn = CHECKS[ch.kind];
    if (!fn) return { kind: ch.kind, pass: false, detail: `unknown check kind '${ch.kind}'` };
    try {
      const [pass, detail] = fn(ch, state);
      return { kind: ch.kind, pass: !!pass, detail };
    } catch (e) {
      return { kind: ch.kind, pass: false, detail: `check threw: ${e.message}` };
    }
  });
}
