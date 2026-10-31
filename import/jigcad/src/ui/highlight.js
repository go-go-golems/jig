// Code colours (CodeEditor): keywords bold, strings grey, comments italic and faint, `=>` red and bold, punctuation
// faint. One HTML string per line, so the editor can wash an error line and the reading views can share it.
const KW = new Set('const let var function return if else for of in new await async class extends export import from while do switch case break continue default throw try catch finally yield typeof instanceof delete void this super static get set'.split(' '));
const LIT = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, s) => `<span class="${cls}">${esc(s)}</span>`;

function highlightJS(text) {
  const lines = [];
  let cur = '', i = 0, state = null;   // state: 'c' (block comment) | '`' (template)
  const n = text.length;
  const push = (cls, s) => {
    // split multi-line tokens so every line is balanced HTML
    const parts = s.split('\n');
    parts.forEach((p, k) => { if (k) { lines.push(cur); cur = ''; } if (p) cur += cls ? span(cls, p) : esc(p); });
  };
  while (i < n) {
    const c = text[i];
    if (state === 'c') { const e = text.indexOf('*/', i); const j = e < 0 ? n : e + 2; push('tk-c', text.slice(i, j)); i = j; state = null; continue; }
    if (state === '`') { let j = i; while (j < n && text[j] !== '`') j += text[j] === '\\' ? 2 : 1; j = Math.min(n, j + 1); push('tk-s', text.slice(i, j)); i = j; state = null; continue; }
    if (c === '\n') { lines.push(cur); cur = ''; i++; continue; }
    if (c === '/' && text[i + 1] === '/') { let j = text.indexOf('\n', i); if (j < 0) j = n; push('tk-c', text.slice(i, j)); i = j; continue; }
    if (c === '/' && text[i + 1] === '*') { state = 'c'; continue; }
    if (c === '`') { push('tk-s', '`'); i++; state = '`'; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      j = Math.min(n, j + 1);
      push('tk-s', text.slice(i, j)); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] || ''))) {
      const m = /^(?:0x[0-9a-f]+|\d[\d_]*\.?\d*(?:e[-+]?\d+)?|\.\d+)/i.exec(text.slice(i, i + 40));
      push('tk-n', m[0]); i += m[0].length; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i, i + 80));
      const w = m[0];
      push(KW.has(w) ? 'tk-k' : LIT.has(w) ? 'tk-b' : '', w); i += w.length; continue;
    }
    if (c === '=' && text[i + 1] === '>') { push('tk-e', '=>'); i += 2; continue; }
    if (/[(){}[\];,.:=+\-*/<>!?&|%^~]/.test(c)) {
      let j = i + 1;
      while (j < n && /[(){}[\];,.:=+\-*/<>!?&|%^~]/.test(text[j]) && !(text[j] === '=' && text[j + 1] === '>') && !(text[j] === '/' && /[/*]/.test(text[j + 1]))) j++;
      push('tk-p', text.slice(i, j)); i = j; continue;
    }
    let j = i + 1;
    while (j < n && !/[\n/"'`0-9A-Za-z_$(){}[\];,.:=+\-*<>!?&|%^~]/.test(text[j])) j++;
    push('', text.slice(i, j)); i = j;
  }
  lines.push(cur);
  return lines;
}

function highlightJSON(text) {
  return text.split('\n').map(line => line.replace(/("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*(?:e[-+]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|([^"\-\d{}[\],:]+)/gi,
    (m, s, nmb, lit, p, rest) => s ? span('tk-s', s) : nmb ? span('tk-n', nmb) : lit ? span('tk-b', lit) : p ? span('tk-p', p) : esc(rest)));
}

function highlightMarkdown(text) {
  let fence = false;
  return text.split('\n').map(line => {
    if (/^```/.test(line)) { fence = !fence; return span('tk-c', line); }
    if (fence) return span('tk-s', line);
    if (/^#{1,4}\s/.test(line) || /^---\s*$/.test(line)) return span('tk-k', line);
    return esc(line).replace(/`[^`]+`/g, m => `<span class="tk-s">${m}</span>`).replace(/\]\((lab:[^)]*)\)/g, (m, l) => `]<span class="tk-p">(</span><span class="tk-e">${l}</span><span class="tk-p">)</span>`);
  });
}

function highlightCSV(text) {
  return text.split('\n').map((line, i) => i === 0 ? span('tk-k', line) : esc(line).replace(/(-?\d+\.?\d*)/g, '<span class="tk-n">$1</span>').replace(/,/g, '<span class="tk-p">,</span>'));
}

export function langOf(path = '') {
  if (/\.(m?js|jsx|ts)$/i.test(path)) return 'js';
  if (/\.json$/i.test(path)) return 'json';
  if (/\.md$/i.test(path)) return 'md';
  if (/\.(csv|tsv)$/i.test(path)) return 'csv';
  return 'text';
}

export function highlightLines(text, lang = 'js') {
  if (lang === 'js') return highlightJS(text);
  if (lang === 'json') return highlightJSON(text);
  if (lang === 'md') return highlightMarkdown(text);
  if (lang === 'csv') return highlightCSV(text);
  return text.split('\n').map(esc);
}

export const highlight = (text, lang = 'js') => highlightLines(text, lang).join('\n');
