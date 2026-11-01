// What the model receives: the instructions (with the Reference appended) on the first user turn of every call,
// a [context] block of live state on the latest user turn, and earlier steps as one line each.
// guides/agent/system-prompt.md and how-the-agent-works.md, translated to CAD.
import { filesOf, bodyId } from './scope.js';

export const HISTORY_CODE = 100;
export const HISTORY_RESULT = 160;
export const CONTEXT_DIAGNOSTICS = 8;

export function instructions(reference = '') {
  return `You are the coding agent inside jigcad, a CAD workbench for jig, a JavaScript language for parametric, print-first CAD: quantities with units, params and configs, sketches with constraints and DOF, features with persistent face names, selectors, assemblies and print jobs, compiled to a Program with metrics, diagnostics and seven IR levels. The open preset is a set of editable files: script.js (a function body that returns a part, sketch, assembly, print job or design), notes.md and data files. The person you are helping sees the code, a drafting-sheet view of the bodies, the feature graph, params, diagnostics, the IR and exports.

You have one tool, eval: it runs an async JavaScript function body in a sandbox with its own copy of the engine and returns the value (as YAML) plus anything you console.log. The language is in scope as in scripts (j, mm, deg, lw, …), so try a piece of it directly before putting it in a script; check() compiles there without touching the workbench. Use eval to read files, edit them, recompile, compile variants, query faces, features and sketches, measure, and set params. Nothing a step defines carries over to the next. The scope is described below under "The agent's eval scope"; help(x) says what a name or value is, and an error names the nearest real names: read it before retrying. Keep results small: pick fields, slice arrays.

How to work:
- Look before you change: files.grep / files.read(path, from, to) to find code; program.summary(), program.graph(), feature(id), faces(selector), why(target) for the compiled program.
- Change code with files.edit(path, find, replace) (exact, unique text) rather than rewriting files. Then call run() and read the result: { ok, errors }. An error names its line in script.js; fix it before going on.
- Verify with numbers from the run: program.metrics(), measure.*, faces(…), sketch(id).dof. Compare before and after when tuning; check(variant) compiles a variant without touching the editor, so a before-and-after pair can come from one step.
- Sweep everything that shares the changed code: every feature downstream of a changed param or sketch (program.graph(), program.params() deps), every selector that resolved through a changed face (why), every config. A persistent name that disappears means a reference broke.
- Say which world a number came from: the open program with the Params view's overrides (run, program.*), or a check() variant at the script's own values; exact B-rep values or approximate ones (as printed, meshed), as program.metrics({ detail: true }) says.
- In Ask mode the person approves each eval; in Read-only mode edits are refused: say what you would change instead (file, line, exact replacement).
- Answer in a few short paragraphs of markdown. Name files and lines; you may include lab: links, which the person can click: [open](lab:open?file=script.js&line=12), [select](lab:face?name=body/end), [feature](lab:node?id=shell), [param](lab:param?name=wall&value=2.4 mm), [view](lab:view?name=front). Use $…$ for maths.
- Units: lengths in millimetres, angles in degrees as shown (radians inside the engine), mass in grams, print time in minutes. A bare number in a typed slot of a script is millimetres.
${reference}`;
}

const fmtNum = v => (typeof v === 'number' ? String(+v.toFixed(3)) : String(v));
const metricText = m => (m && typeof m === 'object' && 'value' in m ? `${Array.isArray(m.value) ? m.value.map(fmtNum).join(' × ') : fmtNum(m.value)}${m.unit ? ' ' + m.unit : ''}` : fmtNum(m));
export const KEY_METRICS = ['volume', 'mass', 'bbox', 'height', 'printTime', 'filament', 'cost', 'supportVolume', 'overhangArea', 'minWall', 'plates', 'fragileRefs'];

export function openFile(host) {
  return host.openFile || host.activeFile || (host.editor && host.editor.path) || (host.intents && host.intents.code && host.intents.code.file) || null;
}

/** The [context] block: one line per piece of live state, each only when it applies. */
export function context(host) {
  const p = host.preset || {};
  const lines = [p.id || p.title ? `preset: ${[p.id, p.title].filter(Boolean).join(' ')}${p.group ? ` (${p.group})` : ''}${p.about ? ' — ' + p.about : ''}` : 'preset: none loaded'];
  // shell, round 2: the preset's agent brief (meta.json `agent`, normalised by the host as host.preset.agent): the
  // role and prompt, and the fragments the person has on (host.fragments, toggled under the composer)
  const ag = p.agent || {};
  if (ag.role || ag.prompt) lines.push(`brief: ${ag.role ? `work as ${ag.role}.` : ''}${ag.role && ag.prompt ? ' ' : ''}${ag.prompt || ''}`);
  const frOn = host.fragments ? [...host.fragments].filter(k => ag.fragments && ag.fragments[k]) : [];
  if (frOn.length) lines.push('rules on:\n' + frOn.map(k => `  ${k} — ${ag.fragments[k]}`).join('\n'));
  const files = filesOf(host);
  const edited = path => {
    if (typeof host.isEdited === 'function') return host.isEdited(path);
    return !!(p.files && p.files[path] !== files.get(path));
  };
  const open = openFile(host);
  if (open) lines.push(`open file: ${open}`);
  lines.push('files: ' + [...files.keys()].sort().map(f => f + (edited(f) ? '*' : '')).join(', ') + ' (* edited)');

  const prog = host.program;
  if (host.compiling) lines.push('compile: running');
  if (!prog) lines.push(host.compileError ? `compile: FAILS — ${host.compileError.message || host.compileError}` : 'compile: none yet');
  else if (prog.ok === false || (prog.diagnostics || []).some(d => d.level === 'error')) {
    const e = (prog.diagnostics || []).find(d => d.level === 'error') || prog.error || {};
    lines.push(`compile: FAILS — ${e.message || 'no message'}${e.line ? ` at script.js:${e.line}` : ''}${host.lastGood ? ' (the view shows the last good compile)' : ''}`);
  } else {
    const s = prog.summary || {};
    const bits = [prog.kind && prog.name ? `${prog.kind} ${prog.name}` : prog.kind || prog.name];
    for (const [k, one] of [['features', 'feature'], ['bodies', 'body'], ['sketches', 'sketch'], ['faces', 'face'], ['parts', 'part']]) if (s[k] != null) bits.push(`${s[k]} ${s[k] === 1 ? one : k}`);
    lines.push(`compile: ok (${bits.filter(Boolean).join(' · ')})`);
  }
  const diags = (prog && prog.diagnostics || []).filter(d => d.level !== 'info');
  if (diags.length) lines.push('diagnostics:\n' + diags.slice(0, CONTEXT_DIAGNOSTICS).map(d => `  ${d.level} ${d.kind}${d.at ? ' at ' + d.at : ''}${d.line ? ' script.js:' + d.line : ''} — ${d.message}`).join('\n') + (diags.length > CONTEXT_DIAGNOSTICS ? `\n  … ${diags.length - CONTEXT_DIAGNOSTICS} more` : ''));

  const good = prog && prog.ok !== false ? prog : host.lastGood;
  if (good) {
    const sk = good.sketches || [];
    const dof = good.summary && good.summary.dof != null ? good.summary.dof : sk.reduce((a, s) => a + (s.dof || 0), 0);
    if (sk.length || (good.summary && good.summary.dof != null)) lines.push(`dof: ${dof}${sk.length ? ' — ' + sk.map(s => `${s.id} ${s.status}${s.dof ? ' ' + s.dof : ''}`).join(', ') : ''}`);
    const ms = good.metrics || {};
    const keys = KEY_METRICS.filter(k => ms[k] != null).slice(0, 6);
    if (keys.length) lines.push('metrics: ' + keys.map(k => `${k} ${metricText(ms[k])}`).join(' · '));
  }
  const ov = host.overrides instanceof Map ? Object.fromEntries(host.overrides) : host.overrides || {};
  const ovk = Object.keys(ov);
  if (ovk.length) lines.push('overrides (Params view): ' + ovk.map(k => `${k} = ${ov[k]}`).join(', '));
  const sel = host.selection;
  if (sel && sel.sketch && (sel.constraint != null || sel.entity != null)) {
    const sk = ((host.program?.ok !== false ? host.program : host.lastGood)?.sketches || []).find(x => x.id === sel.sketch);
    const item = sel.constraint != null ? (sk?.constraints || []).find(c => c.id === sel.constraint) : (sk?.entities || []).find(e => e.id === sel.entity);
    lines.push(`selection: ${sel.constraint != null ? `constraint ${sel.constraint}` : `entity ${sel.entity}`} of sketch ${sel.sketch}${item?.line ? ` (script.js:${item.line})` : ''}`);
  } else if (sel && (sel.name || sel.body != null)) {
    const b = bodyId(host, sel.body);
    lines.push(`selection: ${sel.name || '(no persistent name)'}${b != null ? ' on ' + b : ''}${sel.lost ? ' (lost in the last compile)' : ''}`);
  }
  const v = host.view;
  if (v && v.name) { const ovs = v.overlays ? [...v.overlays] : []; lines.push(`view: ${v.name}${ovs.length ? ' · overlays: ' + ovs.join(', ') : ''}`); }
  return '[context]\n' + lines.join('\n') + '\n[/context]';
}

const oneLine = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
export const firstLine = code => (String(code).split('\n').find(l => l.trim()) || '').trim();

/** One line per earlier step: `[eval] <first line of code> → <result>`. */
export function stepLine(s) {
  return `[eval${s.reverted ? ', later reverted' : ''}] ${oneLine(firstLine(s.code), HISTORY_CODE)} → ${oneLine(s.result ?? '(no result)', HISTORY_RESULT)}`;
}

/** The thread as the turn list sample() takes, ending on a user turn. */
export function toTurns(host, thread, reference = '') {
  const out = [];
  for (const t of thread.turns) {
    if (t.role === 'user') out.push({ role: 'user', content: t.text });
    else {
      const steps = (t.steps || []).map(stepLine);
      out.push({ role: 'assistant', content: [...steps, t.text || '(no answer)'].join('\n') });
    }
  }
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  if (!out.length) return out;
  const firstUser = out.findIndex(m => m.role === 'user');
  out[firstUser] = { ...out[firstUser], content: instructions(reference) + '\n---\n' + out[firstUser].content };
  const last = out.length - 1;
  out[last] = { ...out[last], content: context(host) + '\n\n' + out[last].content };
  // two turns of the same role in a row are merged; the list starts with a user turn
  const merged = [];
  for (const m of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) prev.content += '\n\n' + m.content;
    else merged.push({ ...m });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();
  return merged;
}
