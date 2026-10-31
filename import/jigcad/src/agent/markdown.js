// The Markdown of agent answers → HTML (guides/workbench/reading-markdown.md, the subset an answer uses).
// Raw HTML is escaped. lab: links become <a href="#" class="lablink" data-lab="…">; web links open a new tab;
// any other target drops to its text. If the workbench offers host.renderMarkdown, the panel uses that instead.
import { esc, highlight } from './highlight.js';

// Find the end of a link target: one level of balanced parentheses is allowed inside.
function linkEnd(s, i) {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '(') depth++;
    else if (c === ')') { if (depth === 0) return k; depth--; }
    else if (c === '\n') return -1;
  }
  return -1;
}

export function inline(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && /[\\`*_[\]()$#|>-]/.test(s[i + 1])) { out += esc(s[i + 1]); i += 2; continue; }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i) { out += `<code>${esc(s.slice(i + 1, j))}</code>`; i = j + 1; continue; }
    }
    if (c === '$' && s[i + 1] !== ' ') {
      const j = s.indexOf('$', i + 1);
      if (j > i + 1 && s[j - 1] !== ' ') { out += `<span class="math">${esc(s.slice(i + 1, j))}</span>`; i = j + 1; continue; }
    }
    if (c === '[') {
      // find the matching ]
      let depth = 0, k = i;
      for (; k < s.length; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === '[') depth++; else if (s[k] === ']') { depth--; if (!depth) break; } }
      if (k < s.length && s[k + 1] === '(') {
        const end = linkEnd(s, k + 2);
        if (end > 0) {
          const text = s.slice(i + 1, k), target = s.slice(k + 2, end).trim();
          const inner = inline(text);
          if (/^lab:/.test(target)) out += `<a href="#" class="lablink" data-lab="${esc(target)}">${inner}</a>`;
          else if (/^https?:\/\//.test(target)) out += `<a href="${esc(target)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
          else out += inner;
          i = end + 1; continue;
        }
      }
    }
    if ((c === '*' && s[i + 1] === '*') || (c === '_' && s[i + 1] === '_')) {
      const mark = c + c, j = s.indexOf(mark, i + 2);
      if (j > i + 2) { out += `<b>${inline(s.slice(i + 2, j))}</b>`; i = j + 2; continue; }
    }
    if ((c === '*' || c === '_') && s[i + 1] && s[i + 1] !== ' ' && s[i + 1] !== c) {
      const prev = s[i - 1];
      if (c === '*' || !prev || !/\w/.test(prev)) {
        let j = i + 1;
        while ((j = s.indexOf(c, j)) !== -1 && (s[j - 1] === ' ' || s[j + 1] === c || (c === '_' && s[j + 1] && /\w/.test(s[j + 1])))) j++;
        if (j > i + 1) { out += `<i>${inline(s.slice(i + 1, j))}</i>`; i = j + 1; continue; }
      }
    }
    out += esc(c);
    i++;
  }
  return out;
}

const splitRow = l => {
  let t = l.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells = []; let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (t[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += t[i];
  }
  cells.push(cur.trim());
  return cells;
};
const isSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isBlockStart = l => /^(#{1,4}\s|```|\s*([-*+]|\d+[.)])\s|>|\s*(-{3,}|\*{3,})\s*$|\$\$)/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^```\s*([\w-]*)/))) {
      const lang = m[1].toLowerCase(); const body = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      const code = body.join('\n');
      if (['math', 'tex', 'latex'].includes(lang)) out.push(`<div class="mathblock"><span class="math">${esc(code)}</span></div>`);
      else out.push(`<pre class="src">${!lang || /^(js|javascript|jsx|mjs)$/.test(lang) ? highlight(code) : esc(code)}</pre>`);
      continue;
    }
    if (/^\$\$\s*$/.test(l)) {
      const body = []; i++;
      while (i < lines.length && !/^\$\$\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<div class="mathblock"><span class="math">${esc(body.join('\n'))}</span></div>`);
      continue;
    }
    if ((m = l.match(/^(#{1,4})\s+(.*?)\s*#*\s*$/))) { const n = Math.min(m[1].length, 3); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (l.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = splitRow(l), aligns = splitRow(lines[i + 1]).map(c => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      const al = k => (aligns[k] ? ` style="text-align:${aligns[k]}"` : '');
      out.push(`<div class="tablewrap"><table class="rt"><thead><tr>${head.map((h, k) => `<th${al(k)}>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, k) => `<td${al(k)}>${inline(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^>/.test(l)) {
      const body = [];
      while (i < lines.length && /^>/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<div class="callout">${renderMarkdown(body.join('\n'))}</div>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s/.test(l)) { const r = list(lines, i); out.push(r.html); i = r.next; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i])) && !(lines[i].includes('|') && i + 1 < lines.length && isSep(lines[i + 1]))) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${inline(para.map(x => x.trim()).join(' '))}</p>`);
  }
  return out.join('\n');
}

function list(lines, start) {
  const indentOf = l => l.match(/^\s*/)[0].length;
  const base = indentOf(lines[start]);
  const ordered = /^\s*\d+[.)]\s/.test(lines[start]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { if (i + 1 < lines.length && indentOf(lines[i + 1]) >= base && /^\s*([-*+]|\d+[.)])\s/.test(lines[i + 1])) { i++; continue; } break; }
    const ind = indentOf(l);
    const m = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (m && ind === base) { items.push({ text: [m[2]], sub: [] }); i++; continue; }
    if (ind > base && items.length) {
      if (/^\s*([-*+]|\d+[.)])\s/.test(l)) { const r = list(lines, i); items[items.length - 1].sub.push(r.html); i = r.next; continue; }
      items[items.length - 1].text.push(l.trim()); i++; continue;
    }
    if (!m && items.length && ind >= base && !/^(#{1,4}\s|```|>)/.test(l)) { items[items.length - 1].text.push(l.trim()); i++; continue; }
    break;
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>${items.map(it => `<li>${inline(it.text.join(' '))}${it.sub.join('')}</li>`).join('')}</${tag}>`, next: i };
}
