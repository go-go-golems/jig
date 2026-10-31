// A small JavaScript highlighter for step code and code blocks in answers: HTML with the .tk-* classes
// (tk-k keyword, tk-s string, tk-n number, tk-e the => arrow, tk-c comment, tk-p punctuation).

const KEYWORDS = new Set(('const let var return await async function if else for of in while do new throw try catch finally typeof ' +
  'instanceof true false null undefined this class extends yield break continue switch case default delete void import export from').split(' '));

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^'\\\n]|\\.)*'?|"(?:[^"\\\n]|\\.)*"?|`(?:[^`\\]|\\[\s\S])*`?)|(\b\d[\d_]*(?:\.\d+)?(?:e[-+]?\d+)?\b|\.\d+\b)|(=>)|([A-Za-z_$][\w$]*)|([{}()[\];,.:?=+\-*/%<>!&|^~]+)/g;

export function highlight(code) {
  let out = '', last = 0, m;
  const src = String(code);
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    if (m.index > last) out += esc(src.slice(last, m.index));
    const [t, com, s, n, arrow, id, p] = m;
    if (com) out += `<span class="tk-c">${esc(t)}</span>`;
    else if (s) out += `<span class="tk-s">${esc(t)}</span>`;
    else if (n) out += `<span class="tk-n">${esc(t)}</span>`;
    else if (arrow) out += `<span class="tk-e">${esc(t)}</span>`;
    else if (id) out += KEYWORDS.has(t) ? `<span class="tk-k">${esc(t)}</span>` : esc(t);
    else if (p) out += `<span class="tk-p">${esc(t)}</span>`;
    else out += esc(t);
    last = m.index + t.length;
  }
  return out + esc(src.slice(last));
}
