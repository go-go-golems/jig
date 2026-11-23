// highlight.js — a small JavaScript tokenizer for the editor: keywords bold, strings grey, comments italic,
// and the lambda arrow in red (the workbench's one accent in code).
const KW = new Set('const let var function return if else for while do of in new class extends import export from require this typeof instanceof break continue switch case default try catch finally throw async await yield delete void static get set super'.split(' '));
const LIT = new Set(['null', 'undefined', 'true', 'false', 'NaN', 'Infinity']);
const RE = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^'\\\n]|\\.)*'?|"(?:[^"\\\n]|\\.)*"?|`(?:[^`\\]|\\.)*`?)|(=>)|(\b\d+(?:\.\d+)?(?:e[-+]?\d+)?\b|\.\d+\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.:?!<>=+\-*/%&|^~]+)|(\s+)|(.)/g;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function tokens(src: string): [string, string][] {
  const out: [string, string][] = []; let m: RegExpExecArray | null; RE.lastIndex = 0;
  while ((m = RE.exec(src))) {
    const t = m[0];
    if (m[1]) out.push(['tk-c', t]);
    else if (m[2]) out.push(['tk-s', t]);
    else if (m[3]) out.push(['tk-e', t]);
    else if (m[4]) out.push(['tk-n', t]);
    else if (m[5]) out.push([KW.has(t) ? 'tk-k' : LIT.has(t) ? 'tk-b' : '', t]);
    else if (m[6]) out.push(['tk-p', t]);
    else out.push(['', t]);
    if (!t.length) RE.lastIndex++;
  }
  return out;
}
// one HTML string per line, so the editor can mark lines
export function highlightLines(src: string): string[] {
  const lines = [''];
  for (const [cls, text] of tokens(src)) {
    const parts = text.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push('');
      if (p) lines[lines.length - 1] += cls ? `<span class="${cls}">${esc(p)}</span>` : esc(p);
    });
  }
  return lines;
}
export const highlight = (src: string): string => highlightLines(src).join('\n');
