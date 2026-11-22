// markdown.js — the notes renderer: headings with a contents line, lists, tables, code, callouts,
// KaTeX math ($…$, $$…$$, ```math) and lab: links that drive the workbench.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
import katex from 'katex';
export const slug = s => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function tex(src, display) {
  const K = katex;
  if (K && K.renderToString) {
    try { return K.renderToString(src, { displayMode: !!display, output: 'mathml', throwOnError: false, strict: false }); }
    catch (e) { /* fall through */ }
  }
  return display ? `<pre class="tex">${esc(src)}</pre>` : `<code class="tex">${esc(src)}</code>`;
}

// inline: code, math, links, bold, italics. Code and math are cut out first so their contents stay literal.
export function inline(s) {
  const keep = [];
  const stash = html => `\u0000${keep.push(html) - 1}\u0000`;
  s = s.replace(/`([^`]+)`/g, (_, c) => stash(`<code>${esc(c)}</code>`));
  s = s.replace(/\$\$([^$]+)\$\$/g, (_, m) => stash(tex(m, true)));
  s = s.replace(/(^|[^\\$\w])\$([^$\n]+?)\$(?![\w$])/g, (_, pre, m) => pre + stash(tex(m, false)));
  s = esc(s).replace(/\\\$/g, '$');
  // lab: links may contain spaces and one level of parentheses: [open](lab:open?file=a.js&find=.phase('x'))
  s = s.replace(/\[([^\]]+)\]\((lab:(?:[^()\n]|\([^()\n]*\))*|[^)\s]+)\)/g, (_, text, href) => {
    const h = href.replace(/&amp;/g, '&');
    if (/^lab:/.test(h)) return `<a href="#" class="lablink" data-lab="${esc(h)}">${text}</a>`;
    if (/^#/.test(h)) return `<a href="#" data-anchor="${esc(h.slice(1))}">${text}</a>`;
    if (/^https?:/.test(h)) return `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    return text;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>').replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}

const CALLOUTS = [[/^(try it|try|play)\b/i, 'try'], [/^(exercise|exercises|challenge)\b/i, 'exercise'], [/^(caveat|careful|warning|watch out|note)\b/i, 'caveat']];

export function render(md, o = {}) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const out = [], toc = [];
  let i = 0;
  const para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const L = lines[i];
    // fenced code / math
    let m = L.match(/^```\s*([\w-]*)\s*$/);
    if (m) {
      flushPara(); const lang = m[1].toLowerCase(), body = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      if (lang === 'math' || lang === 'tex' || lang === 'latex') out.push(`<div class="mathblock">${tex(body.join('\n'), true)}</div>`);
      else if (lang === 'diagram') out.push(o.trusted ? `<figure class="fig mmd">${body.join('\n')}</figure>` : figure(body.join('\n'), '', o));
      else if (lang === 'svg') {
        // a figure: the SVG, then (optionally) a caption paragraph that starts with "Figure N.k"
        let j = i; while (j < lines.length && /^\s*$/.test(lines[j])) j++;
        let cap = '';
        if (j < lines.length && /^\s*\*{0,2}_?Figure\s+[\w.]+/.test(lines[j])) { const c = []; while (j < lines.length && !/^\s*$/.test(lines[j])) c.push(lines[j++].trim()); cap = c.join(' '); i = j; }
        out.push(figure(body.join('\n'), cap, o));
      }
      else out.push(`<pre class="src${lang ? ' lang-' + lang : ''}">${o.highlight && (lang === 'js' || lang === 'javascript' || lang === '') ? o.highlight(body.join('\n')) : esc(body.join('\n'))}</pre>`);
      continue;
    }
    // display math $$ … $$ on its own lines
    if (/^\s*\$\$/.test(L)) {
      flushPara(); let body = L.replace(/^\s*\$\$/, '');
      if (/\$\$\s*$/.test(body)) { out.push(`<div class="mathblock">${tex(body.replace(/\$\$\s*$/, ''), true)}</div>`); i++; continue; }
      const parts = [body]; i++;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])) parts.push(lines[i++]);
      if (i < lines.length) parts.push(lines[i].replace(/\$\$\s*$/, ''));
      i++; out.push(`<div class="mathblock">${tex(parts.join('\n'), true)}</div>`); continue;
    }
    // headings
    m = L.match(/^(#{1,4})\s+(.*)$/);
    if (m) {
      flushPara(); const lvl = m[1].length, text = m[2].trim(), id = slug(text);
      if (lvl === 2) toc.push({ id, text });
      out.push(`<h${lvl} id="${o.idPrefix || ''}${id}">${inline(text)}</h${lvl}>`); i++; continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(L)) { flushPara(); out.push('<hr>'); i++; continue; }
    // tables
    if (/^\s*\|.*\|\s*$/.test(L) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flushPara();
      const row = s => s.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      const head = row(L), aligns = row(lines[i + 1]).map(c => /:$/.test(c) ? (/^:/.test(c) ? 'center' : 'right') : 'left');
      i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(row(lines[i++]));
      const al = k => aligns[k] && aligns[k] !== 'left' ? ` style="text-align:${aligns[k]}"` : '';
      out.push(`<div class="tablewrap-x"><table class="rt doc-t"><thead><tr>${head.map((c, k) => `<th${al(k)}>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, k) => `<td${al(k)}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    // block quotes → callouts
    if (/^>\s?/.test(L)) {
      flushPara(); const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      const first = body.join(' ').replace(/^\*\*([^*]+)\*\*.*/, '$1').trim();
      let cls = '';
      for (const [re, c] of CALLOUTS) if (re.test(first)) { cls = c; break; }
      out.push(`<div class="callout ${cls}">${render(body.join('\n'), Object.assign({}, o, { inner: true })).html}</div>`);
      continue;
    }
    // lists (nested by indentation)
    if (/^\s*([-*+]|\d+[.)])\s+/.test(L)) {
      flushPara();
      const items = [];
      while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const mm = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (mm) items.push({ ind: mm[1].length, ord: /\d/.test(mm[2]), text: mm[3] });
        else items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
      }
      out.push(listHtml(items, 0, items.length ? items[0].ind : 0).html);
      continue;
    }
    if (/^\s*$/.test(L)) { flushPara(); i++; continue; }
    para.push(L.trim()); i++;
  }
  flushPara();
  let html = out.join('\n');
  if (!o.inner && o.toc !== false && toc.length >= 3) html = html.replace(/(<\/h1>\s*(?:<p>[\s\S]*?<\/p>)?)/, `$1\n<nav class="toc">${toc.map(t => `<a href="#" data-anchor="${o.idPrefix || ''}${t.id}">${esc(t.text.replace(/[`*$]/g, ''))}</a>`).join('')}</nav>`);
  return { html, toc };
}
function listHtml(items, start, ind) {
  const ord = items[start] && items[start].ord, parts = []; let i = start;
  while (i < items.length && items[i].ind >= ind) {
    if (items[i].ind > ind) { const sub = listHtml(items, i, items[i].ind); parts[parts.length - 1] = parts[parts.length - 1].replace(/<\/li>$/, sub.html + '</li>'); i = sub.next; continue; }
    parts.push(`<li>${inline(items[i].text)}</li>`); i++;
  }
  return { html: `<${ord ? 'ol' : 'ul'}>${parts.join('')}</${ord ? 'ol' : 'ul'}>`, next: i };
}
// ---------- figures: inline SVG drawn with the page's own colours ----------
// Figures use currentColor and a few classes (ink, mut, acc, hair; f-ink, f-mut, f-acc, f-fill, f-paper) so they follow
// the theme. Scripts, styles, foreign objects, event handlers and outside links are removed; ids are made unique per
// figure so two figures can both define an "arrow" marker.
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export function sanitizeSvg(src) {
  let s = String(src).trim();
  if (!/^<svg[\s>]/.test(s)) return null;
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|foreignObject|iframe|image)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<(script|style|foreignObject|iframe|image)\b[^>]*\/>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '');
  const p = 'f' + hash(s) + '-';
  s = s.replace(/\sid\s*=\s*"([^"]+)"/g, ` id="${p}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}$1)`).replace(/(\s(?:xlink:)?href\s*=\s*")#([^"]+)"/g, `$1#${p}$2"`);
  // size: the root's width (or its viewBox width) becomes a max-width; the figure scales down to fit
  const root = s.match(/^<svg\b[^>]*>/)[0];
  const vb = (root.match(/viewBox\s*=\s*"([^"]+)"/) || [])[1], w = +((root.match(/\swidth\s*=\s*"([\d.]+)/) || [])[1] || (vb ? vb.trim().split(/[\s,]+/)[2] : 0));
  let r = root.replace(/\s(width|height|style|class)\s*=\s*"[^"]*"/g, '');
  if (!/xmlns=/.test(r)) r = r.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  r = r.replace(/>$/, ` class="figsvg"${w ? ` style="max-width:${w}px"` : ''}>`);
  return s.replace(/^<svg\b[^>]*>/, r);
}
function figure(src, cap, o) {
  const svg = sanitizeSvg(src);
  if (!svg) return `<pre class="src">${esc(src)}</pre>`;
  const label = cap.replace(/[*_`$\\]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const s = label ? svg.replace(/^<svg\b/, `<svg role="img" aria-label="${esc(label)}"`) : svg;
  return `<figure class="fig">${s}${cap ? `<figcaption>${inline(cap)}</figcaption>` : ''}</figure>`;
}

// the title and first paragraph, for lists and menus
export function summary(md) { const t = (md.match(/^#\s+(.*)$/m) || [])[1] || ''; return t; }
