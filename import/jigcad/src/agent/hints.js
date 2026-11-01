// Hints (JIG-012 phase 2): notes appended to a step's result for the mistakes the failure report counts most
// often (tools/agent-eval/failures.mjs). The model learns from the error it gets, so each hint names the fix in
// the step's own terms. Hints are pure functions of the error, the code and what the scope has; the guards
// (engine/guard.js) already answer a missing namespace member at the read, so these cover what a proxy cannot:
//
//   not defined        nearest scope name, a j member (box → j.box), or: steps do not share variables
//   not a function     a value's method that does not exist: the nearest methods of the language's values
//   read of undefined  which expression on the line was undefined; check()/run() results without a program
//   NaN                where NaN comes from (a quantity used as a number, a missing value)
import { closest } from '../engine/guard.js';

const LINE = /\(line (\d+)\)$/;

/**
 * Notes for one step's result → [string]. ctx:
 *   error     the thrown value (or null)
 *   text      the formatted result (for NaN)
 *   code      the step's source
 *   names     the names in the step's scope
 *   j         the language namespace, when the step has it (the sandbox)
 *   methods   { kind: [method names] } of the language's values (help.js methodsByKind; sandbox)
 *   line      the step's line of the error (errorText's), or null
 */
export function hintsFor({ error, text = '', code = '', names = [], j = null, methods = null, line = null }) {
  const out = [];
  const msg = error && typeof error === 'object' ? String(error.message ?? '') : '';
  if (error?.guard) return out;   // a guard's message already says it all

  let m;
  if (error?.name === 'ReferenceError' && (m = /^(\w+|\$\w*) is not defined$/.exec(msg))) {
    out.push(notDefined(m[1], names, j));
  } else if (error?.name === 'TypeError' && (m = /^(.+)\.(\w+) is not a function$/.exec(msg)) && methods) {
    const h = notAMethod(m[1], m[2], methods);
    if (h) out.push(h);
  } else if (error?.name === 'TypeError' && (m = /^Cannot read properties of (undefined|null) \(reading '([^']+)'\)$/.exec(msg))) {
    out.push(readOfUndefined(m[1], m[2], code, line));
  }
  if (!error && /(^|[\s:[,])NaN($|[\s,\]])/m.test(text)) {
    out.push("note: NaN in the result: arithmetic mixed a quantity with a missing value (undefined) or with a string. Give numbers with q.in('mm'), and check the fields read exist.");
  }
  return out.filter(Boolean);
}

function notDefined(name, names, j) {
  const near = closest(name, names);
  let inJ = false;
  try { inJ = !!j && name in j; } catch { inJ = false; }
  if (inJ) return `note: ${name} is j.${name}.${near.length ? ` (In scope near it: ${near.join(', ')}.)` : ''}`;
  if (near.length) return `note: did you mean ${near.join(' or ')}? Those are in this step's scope.`;
  return `note: ${name} is not in this step's scope. Steps do not share variables: a const, let or globalThis value from an earlier step is gone. Define it again here, or keep it in a file and read it.`;
}

function notAMethod(expr, method, methods) {
  const has = Object.entries(methods).filter(([, ms]) => ms.includes(method)).map(([k]) => k);
  const near = [];
  for (const [kind, ms] of Object.entries(methods)) for (const n of closest(method, ms, 2)) near.push(`.${n}() (${kind})`);
  const parts = [];
  if (has.length) parts.push(`.${method}() is a method of a ${has.join(' or a ')}; ${expr} is something else.`);
  if (near.length) parts.push(`Nearest methods: ${near.slice(0, 4).join(', ')}.`);
  if (!parts.length) return '';
  return `note: ${expr} has no .${method}(). ${parts.join(' ')}`;
}

const RESULT_KEYS = new Set(['summary', 'program', 'metrics', 'warnings', 'bodies']);

function readOfUndefined(what, prop, code, line) {
  const src = String(code).split('\n');
  const lines = line && src[line - 1] != null ? [src[line - 1]] : src;
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`([A-Za-z_$][\\w$]*(?:\\(\\))?(?:\\??\\.[A-Za-z_$][\\w$]*(?:\\([^()]*\\))?|\\[[^\\]]+\\])*)\\??\\.${esc}\\b`, 'g');
  let found = null;
  for (const l of lines) { const m = re.exec(l); re.lastIndex = 0; if (m) { found = m[1]; break; } }
  if (found) {
    const last = found.split('.').pop();
    if (RESULT_KEYS.has(last)) {
      return `note: ${found} is ${what}. check() and run() give summary, metrics and program only when the script compiles (ok: true); when it fails they give errors. Test r.ok first, or return r.errors.`;
    }
    return `note: ${found} is ${what}${line ? ` on line ${line}` : ''}, so .${prop} cannot be read. Return ${found.split(/\??\./)[0]} to see what it holds.`;
  }
  return `note: a value was ${what} where .${prop} was read${line ? ` on line ${line}` : ''}.`;
}

/** The step's line of an error text ("… (line 3)") → 3, or null. */
export function lineOf(errText) { const m = LINE.exec(String(errText)); return m ? +m[1] : null; }
