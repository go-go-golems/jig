// A click on a lab: link in an answer. The workbench's host.link(href) handles every action (src/host/lab.js);
// when a host has no link() (tests, another shell) this follows the same actions with the calls of BUILD.md §4.
import { labScope } from './scope.js';

export function parseLab(href) {
  const u = new URL(String(href).replace(/^lab:/, 'lab://x/'));
  const q = {};
  for (const [k, v] of u.searchParams) q[k] = v;
  return { action: u.pathname.replace(/^\//, '').split('/')[0], q };
}

export async function followLink(host, href, { ask } = {}) {
  if (typeof host.link === 'function') return host.link(href);
  let action, q;
  try { ({ action, q } = parseLab(href)); } catch { host.toast && host.toast('unknown lab link ' + href, 'error'); return false; }
  const scope = labScope(host);
  const fail = msg => { host.toast && host.toast(msg, 'error'); return false; };
  const focus = (view, intent) => { if (typeof host.focus === 'function') host.focus(view, intent); };
  try {
    switch (action) {
      case 'open': focus('code', { file: q.file || 'script.js', line: q.line ? +q.line : undefined, find: q.find }); return true;
      case 'face': case 'select': scope.select(q.name || q.id); focus(q.in || 'stage'); return true;
      case 'node':
        if (typeof host.selectNode === 'function') host.selectNode(q.id);
        focus(q.in || 'graph'); return true;
      case 'param':
        if (q.value != null && q.value !== '') await scope.params.set(q.name || q.id, isNaN(+q.value) ? q.value : +q.value);
        focus('params', { param: q.name || q.id }); return true;
      case 'view': if (q.name) scope.view.set({ name: q.name }); focus(q.show || 'stage'); return true;
      case 'overlay': {
        const cur = new Set(host.view && host.view.overlays ? host.view.overlays : []);
        const on = q.on == null ? !cur.has(q.name) : q.on === '1' || q.on === 'true';
        scope.view.set({ overlays: { [q.name]: on } }); focus('stage'); return true;
      }
      case 'preset': await host.loadPreset(q.id); return true;
      case 'build': case 'run': case 'compile': await host.compile(); return true;
      case 'reset': await scope.params.clear(); return true;
      case 'show': case 'tile': focus(q.view); return true;
      case 'doc': focus('docs', { id: q.id, at: q.at }); return true;
      case 'book': focus('book', { ch: q.ch, at: q.at }); return true;
      case 'ask': if (ask) ask(q.q || ''); focus('agent', { q: q.q }); return true;
      default: return fail('unknown lab link ' + href);
    }
  } catch (e) { return fail(e.message || String(e)); }
}
