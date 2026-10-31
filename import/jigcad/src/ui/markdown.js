// The Markdown the reading views render (reading-markdown.md): small on purpose. Raw HTML is escaped.
// Returns { html, headings, figs, sketches }; jig figures (```figure) and sketches (```sketch) are placeholders the
// Doc component fills after mount. KaTeX is not vendored, so maths is set as Unicode in the `.tex` face.
import { esc, highlight } from './highlight.js';

export const slug = s => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------- maths, as Unicode ----------
const TEX = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', kappa: 'κ', lambda: 'λ',
  mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω',
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', infty: '∞', partial: '∂', nabla: '∇', sum: 'Σ', prod: 'Π', int: '∫',
  cup: '∪', cap: '∩', in: '∈', subset: '⊂', perp: '⟂', parallel: '∥', circ: '∘', deg: '°', ldots: '…', cdots: '⋯', lVert: '‖', rVert: '‖',
  vert: '|', quad: ' ', qquad: '  ', ',': ' ', ';': ' ', '!': '', sqrt: '√', angle: '∠', triangle: '△', star: '⋆',
};
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ',
  t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ',
  M: 'ᴹ', N: 'ᴺ', O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' };
export function texToText(src) {
  let s = String(src);
  for (let k = 0; k < 4; k++) {
    s = s.replace(/\\(?:t|d)?frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => `${a.length > 1 ? `(${a})` : a}/${b.length > 1 ? `(${b})` : b}`)
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:mathrm|mathbf|text|operatorname|mathit|hat|bar|vec|dot|ddot|boldsymbol)\{([^{}]*)\}/g, '$1');
  }
  s = s.replace(/\\([A-Za-z]+|[,;! ])/g, (m, w) => TEX[w] ?? w)
    .replace(/\^\{([^{}]*)\}|\^(\S)/g, (m, a, b) => { const t = a ?? b; return [...t].every(c => SUP[c]) ? [...t].map(c => SUP[c]).join('') : `^${t}`; })
    .replace(/_\{([^{}]*)\}|_(\S)/g, (m, a, b) => { const t = a ?? b; return [...t].every(c => SUB[c]) ? [...t].map(c => SUB[c]).join('') : `_${t}`; })
    .replace(/[{}]/g, '').replace(/\\begin\{aligned\}|\\end\{aligned\}|&/g, '').replace(/\\\\/g, '\n');
  return s;
}

// maths set as MathML would be: a math face, single-letter variables in italic
const mathHTML = src => esc(texToText(src)).replace(/(^|[^A-Za-z&;#])([A-Za-z\u03b1-\u03c9])(?![A-Za-z])/g, '$1<i>$2</i>');

// ---------- inline ----------
function findClose(s, from, open, close) {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === open) depth++;
    else if (s[i] === close) { if (depth === 0) return i; depth--; }
  }
  return -1;
}
function link(text, target, prefix) {
  const t = target.trim();
  if (t.startsWith('lab:')) return `<a href="#" class="lablink" data-lab="${esc(t)}">${text}</a>`;
  if (t.startsWith('#')) return `<a href="#" data-anchor="${esc(prefix + slug(t.slice(1)))}">${text}</a>`;
  if (/^https?:\/\//.test(t)) return `<a href="${esc(t)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  return text;
}
export function inline(s, prefix = 'd-') {
  let out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && /[\\`*_[\]()#+\-.!$|]/.test(s[i + 1])) { out += esc(s[i + 1]); i += 2; continue; }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i) { out += `<code>${esc(s.slice(i + 1, j))}</code>`; i = j + 1; continue; }
    }
    if (c === '$' && s[i + 1] !== ' ' && s[i + 1] !== '$') {
      let j = i + 1;
      while (j < s.length && !(s[j] === '$' && s[j - 1] !== '\\')) j++;
      if (j < s.length && s[j - 1] !== ' ' && !/[A-Za-z0-9]/.test(s[j + 1] || '')) {
        out += `<span class="math" title="${esc(s.slice(i + 1, j))}">${mathHTML(s.slice(i + 1, j))}</span>`;
        i = j + 1; continue;
      }
    }
    if (c === '[') {
      const j = findClose(s, i + 1, '[', ']');
      if (j > i && s[j + 1] === '(') {
        const k = findClose(s, j + 2, '(', ')');
        if (k > j) { out += link(inline(s.slice(i + 1, j), prefix), s.slice(j + 2, k), prefix); i = k + 1; continue; }
      }
    }
    if (c === '*' && s[i + 1] === '*') {
      const j = s.indexOf('**', i + 2);
      if (j > i + 2) { out += `<b>${inline(s.slice(i + 2, j), prefix)}</b>`; i = j + 2; continue; }
    }
    if ((c === '*' || c === '_') && s[i + 1] && s[i + 1] !== ' ' && (c === '*' || !/\w/.test(s[i - 1] || ''))) {
      let j = i + 1;
      while (j < s.length && !(s[j] === c && s[j - 1] !== ' ' && (c === '*' || !/\w/.test(s[j + 1] || '')))) j++;
      if (j < s.length && j > i + 1) { out += `<i>${inline(s.slice(i + 1, j), prefix)}</i>`; i = j + 1; continue; }
    }
    let j = i + 1;
    while (j < s.length && !/[\\`$[*_]/.test(s[j])) j++;
    out += esc(s.slice(i, j));
    i = j;
  }
  return out;
}

// ---------- SVG figures: parse, keep drawing elements only ----------
const SVG_OK = new Set('svg g path line polyline polygon rect circle ellipse text tspan defs marker title desc use clipPath'.split(' '));
function sanitizeSVG(src, k) {
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'svg' || doc.querySelector('parsererror')) return null;
  const walk = el => {
    for (const child of [...el.children]) {
      if (!SVG_OK.has(child.nodeName)) { child.remove(); continue; }
      for (const a of [...child.attributes]) {
        if (/^on/i.test(a.name) || a.name === 'style' || (/href$/i.test(a.name) && !/^#/.test(a.value))) child.removeAttribute(a.name);
        else if (a.name === 'id') child.setAttribute('id', `f${k}-${a.value}`);
        else if (/url\(#/.test(a.value)) child.setAttribute(a.name, a.value.replace(/url\(#([^)]+)\)/g, `url(#f${k}-$1)`));
        else if (/href$/i.test(a.name)) child.setAttribute(a.name, `#f${k}-${a.value.slice(1)}`);
      }
      walk(child);
    }
  };
  walk(root);
  const w = root.getAttribute('width');
  root.removeAttribute('width'); root.removeAttribute('height'); root.removeAttribute('style');
  root.setAttribute('class', 'figsvg');
  if (w) root.setAttribute('data-maxw', String(parseFloat(w)));
  return new XMLSerializer().serializeToString(root);
}

// ---------- blocks ----------
const CALLOUT = [[/^(Try it|Try|Play)\.?$/i, 'try'], [/^(Exercise|Challenge)\.?$/i, 'exercise'], [/^(Careful|Caveat|Warning|Watch out|Note)\.?$/i, 'caveat']];

export function renderMarkdown(src, opts = {}) {
  const prefix = opts.prefix ?? 'd-';
  const figs = opts.figs ?? [], sketches = opts.sketches ?? [], headings = [];
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isBlank = l => !l || !l.trim();
  const startsBlock = l => /^(```|\$\$|#{1,4}\s|>|\s*([-*]|\d+\.)\s+|---+\s*$|\|)/.test(l);

  const caption = () => {
    let j = i;
    while (j < lines.length && isBlank(lines[j])) j++;
    if (j < lines.length && /^(\*\*)?Figure\s+[\w.]+/.test(lines[j])) {
      const para = [];
      while (j < lines.length && !isBlank(lines[j])) para.push(lines[j++]);
      i = j;
      return `<figcaption>${inline(para.join(' '), prefix)}</figcaption>`;
    }
    return '';
  };

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const fence = /^```\s*([\w-]*)\s*(.*)$/.exec(line);
    if (fence) {
      const lang = fence[1].toLowerCase(), body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      const code = body.join('\n');
      if (lang === 'svg') {
        const k = figs.length + sketches.length + out.length;
        const svg = sanitizeSVG(code, k);
        out.push(svg ? `<figure class="fig">${svg}${caption()}</figure>` : `<p class="fail"><b>Figure does not parse.</b> The svg block must be one well-formed &lt;svg&gt; element.</p>`);
      } else if (lang === 'figure') {
        const options = {};
        for (const l of body) { const m = /^\s*\/\/\s*(view|zoom|overlays|height|select|caption|title)\s*:\s*(.+)$/i.exec(l); if (m) options[m[1].toLowerCase()] = m[2].trim(); }
        const idx = figs.length;
        figs.push({ code, options });
        out.push(`<figure class="fig jigfig" data-fig="${idx}"><div class="figslot" data-h="${Math.min(560, Math.max(140, +options.height || 260))}"></div>${caption()}</figure>`);
      } else if (lang === 'sketch') {
        const idx = sketches.length;
        const t = /^\s*\/\/\s*title\s*:\s*(.+)$/im.exec(code);
        sketches.push({ code, title: t ? t[1].trim() : '' });
        out.push(`<div class="sketchblock"><pre class="src lang-js">${highlight(code, 'js')}</pre><p class="sketchact"><a href="#" class="lablink" data-sketch="${idx}">Open in the workbench</a> <span class="dim">as a scratch preset; the book keeps its copy</span></p></div>`);
      } else if (['math', 'tex', 'latex'].includes(lang)) {
        out.push(`<div class="mathblock"><div class="math display" title="${esc(code)}">${mathHTML(code)}</div></div>`);
      } else if (['js', 'javascript', 'jsx', 'mjs', ''].includes(lang)) {
        out.push(`<pre class="src lang-js">${highlight(code, 'js')}</pre>`);
      } else {
        out.push(`<pre class="src plain">${esc(code)}</pre>`);
      }
      continue;
    }
    if (/^\$\$\s*$/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^\$\$\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<div class="mathblock"><div class="math display" title="${esc(body.join('\n'))}">${mathHTML(body.join('\n'))}</div></div>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = h[1].length, text = inline(h[2], prefix), id = prefix + slug(h[2]);
      headings.push({ level, id, text: h[2].replace(/[*_`]/g, '') });
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^>/.test(line)) {
      const body = [];
      while (i < lines.length && /^>/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      const first = /^\s*\*\*([^*]+)\*\*/.exec(body[0] || '');
      const kind = first ? CALLOUT.find(([re]) => re.test(first[1].trim()))?.[1] : null;
      out.push(`<div class="callout${kind ? ' ' + kind : ''}">${renderMarkdown(body.join('\n'), { prefix, figs, sketches }).html}</div>`);
      continue;
    }
    if (/^\|/.test(line) && /^\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const cells = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      const head = cells(line), align = cells(lines[i + 1]).map(c => /^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : '');
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      const td = (tag, c, k) => `<${tag}${align[k] ? ` class="al-${align[k][0]}"` : ''}>${inline(c, prefix)}</${tag}>`;
      out.push(`<div class="tablewrap-x"><table class="rt doc-t"><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, k) => td('td', c, k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(l);
        if (m) { items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] }); i++; continue; }
        if (!isBlank(l) && /^\s+\S/.test(l) && items.length) { items[items.length - 1].text += ' ' + l.trim(); i++; continue; }
        if (isBlank(l) && /^\s*([-*]|\d+\.)\s+/.test(lines[i + 1] || '')) { i++; continue; }
        break;
      }
      out.push(renderList(items, 0, prefix).html);
      continue;
    }
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !(para.length && startsBlock(lines[i]))) para.push(lines[i++]);
    out.push(`<p>${inline(para.join('\n').replace(/ {2,}\n/g, '<br>\n'), prefix).replace(/&lt;br&gt;/g, '<br>')}</p>`);
  }

  // the contents line under the lede when there are three or more sections
  const h2s = headings.filter(h => h.level === 2);
  if (opts.toc !== false && h2s.length >= 3) {
    const at = out.findIndex(s => s.startsWith('<h1'));
    const lede = at >= 0 && out[at + 1]?.startsWith('<p>') ? at + 2 : at + 1;
    out.splice(Math.max(0, lede), 0, `<nav class="toc">${h2s.map(h => `<a href="#" data-anchor="${h.id}">${esc(h.text)}</a>`).join('')}</nav>`);
  }
  return { html: out.join('\n'), headings, figs, sketches };
}

function renderList(items, from, prefix) {
  const base = items[from].indent, tag = items[from].ordered ? 'ol' : 'ul';
  let html = `<${tag}>`, i = from;
  while (i < items.length && items[i].indent >= base) {
    if (items[i].indent > base) { const sub = renderList(items, i, prefix); html = html.replace(/<\/li>$/, sub.html + '</li>'); i = sub.next; continue; }
    html += `<li>${inline(items[i].text, prefix)}</li>`;
    i++;
  }
  return { html: html + `</${tag}>`, next: i };
}
