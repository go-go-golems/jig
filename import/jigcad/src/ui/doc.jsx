// A rendered Markdown document (Doc): lab: links act in the workbench, #anchors scroll, ```figure blocks are
// compiled with host.check and drawn with the stage's renderSheet, ```sketch blocks open as scratch presets.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { renderMarkdown } from './markdown.js';
import { loadStage } from './modules.js';
import { NAMED_VIEWS, findFace } from '../host/host.js';

const figCache = new Map();   // script text → Promise<ProgramData>

export function scrollToAnchor(root, id) {
  if (!root || !id) return false;
  const el = root.querySelector(`#${CSS.escape(id)}`) || root.ownerDocument.getElementById(id);
  if (!el) return false;
  const sc = el.closest('.scroll');
  if (sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 12;
  else el.scrollIntoView({ block: 'start' });
  return true;
}

export function Doc({ host, md, prefix = 'd-', className = 'doc', source = 'the docs', toc = true, at, figPrefix }) {
  const ref = useRef(null);
  const r = useMemo(() => renderMarkdown(md || '', { prefix, toc }), [md, prefix, toc]);

  useEffect(() => {
    if (at) requestAnimationFrame(() => scrollToAnchor(ref.current, at.startsWith(prefix) ? at : prefix + at));
  }, [r, at]);

  // sizes carried as data attributes (no inline style in the HTML string)
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll('[data-maxw]').forEach(el => { el.style.maxWidth = el.dataset.maxw + 'px'; });
    root.querySelectorAll('.figslot[data-h]').forEach(el => { el.style.height = el.dataset.h + 'px'; });
  }, [r]);

  // live figures
  useEffect(() => {
    const root = ref.current;
    if (!root || !r.figs.length) return;
    let alive = true;
    const draws = [];
    const slots = [...root.querySelectorAll('figure.jigfig[data-fig]')];
    slots.forEach(fig => {
      const spec = r.figs[+fig.dataset.fig];
      const slot = fig.querySelector('.figslot');
      if (!spec || !slot) return;
      const label = fig.querySelector('figcaption b')?.textContent?.replace(/\.$/, '') || `Figure ${+fig.dataset.fig + 1}`;
      slot.classList.add('busy');
      // a what-if compile of the figure's own script: the worker keeps the open preset's Program (keep: false), and the
      // preset's files do not leak into the figure (merge: false)
      if (!figCache.has(spec.code)) figCache.set(spec.code, host.check({ 'script.js': spec.code }, { keep: false, merge: false }));
      Promise.all([figCache.get(spec.code), loadStage()]).then(([program, stage]) => {
        if (!alive) return;
        slot.classList.remove('busy');
        if (!program || program.ok === false) {
          figCache.delete(spec.code);
          const d = program?.diagnostics?.find(d => d.level === 'error');
          slot.outerHTML = `<p class="fail"><b>${label} does not compile.</b> ${escapeHTML(d?.message || program?.error?.message || 'no program')}${d?.line ? ` (line ${d.line} of the figure’s script)` : ''}</p>`;
          return;
        }
        const name = NAMED_VIEWS[spec.options.view] ? spec.options.view : 'axo';
        const overlays = new Set((spec.options.overlays || 'dims').split(',').map(s => s.trim()).filter(Boolean));
        const view = { name, yaw: 0, pitch: 0, zoom: +spec.options.zoom || 1, scale: null, pan: [0, 0], target: null, overlays };
        const canvas = document.createElement('canvas');
        canvas.className = 'figsheet';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${label}: ${program.name || 'part'}, ${name} view`);
        slot.replaceChildren(canvas);
        const selection = spec.options.select ? { name: spec.options.select, ...(findFace(program, spec.options.select) || {}) } : null;
        const draw = () => { try { stage.renderSheet(canvas, program, view, { overlays, selection, titleBlock: false, figure: true }); } catch (e) { console.error('renderSheet failed:', e); } };
        draws.push(draw);
        draw();
      });
    });
    const offTheme = host.on('theme', () => setTimeout(() => draws.forEach(d => d()), 30));
    const ro = new ResizeObserver(() => draws.forEach(d => d()));
    ro.observe(root);
    return () => { alive = false; offTheme(); ro.disconnect(); };
  }, [r]);

  const onClick = e => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.dataset.lab) { e.preventDefault(); host.link(a.dataset.lab); return; }
    if (a.dataset.anchor) { e.preventDefault(); scrollToAnchor(ref.current, a.dataset.anchor); return; }
    if (a.dataset.sketch != null) {
      e.preventDefault();
      const sk = r.sketches[+a.dataset.sketch];
      if (sk) host.loadScratch({ 'script.js': sk.code }, { title: sk.title || `Sketch from ${source}`, about: `opened from ${source}` }).then(ok => ok && host.focus('code'));
      return;
    }
    if (a.getAttribute('href') === '#') e.preventDefault();
  };
  return <article class={className} ref={ref} onClick={onClick} dangerouslySetInnerHTML={{ __html: r.html }} />;
}

export const escapeHTML = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The lists that tie a document to the rest of the workbench (RelatedList). */
export function Related({ host, groups }) {
  const shown = groups.filter(g => g.items.length);
  if (!shown.length) return null;
  return (
    <div class="doc related">
      {shown.map(g => (
        <div key={g.title}>
          <h4>{g.title}</h4>
          <ul>{g.items.map(it => (
            <li key={it.href}><a href="#" class="lablink" onClick={e => { e.preventDefault(); host.link(it.href); }}>{it.label}</a>{it.about && <span class="dim"> — {it.about}</span>}</li>
          ))}</ul>
        </div>
      ))}
    </div>
  );
}
