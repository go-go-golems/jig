// lab: links: Markdown links that drive the workbench. Both spellings work:
//   path style   lab:view/stage?view=front · lab:select/body/end · lab:param/w=80 · lab:preset/A-06 · lab:run
//   query style  lab:view?name=front · lab:node?id=shell · lab:param?id=w&value=80 · lab:preset?id=A-06
// The first path segment is the action; the rest of the path and the query are its arguments.
import { NAMED_VIEWS, findFace } from './host.js';
import { resolveParamName } from './param-names.js';

export const VIEW_IDS = ['notes', 'code', 'agent', 'docs', 'book', 'reference', 'stage', 'params', 'graph', 'ir', 'trace', 'experiments'];

export function parseLink(href) {
  const raw = String(href || '').trim();
  if (!raw.startsWith('lab:')) return null;
  let url;
  try { url = new URL('lab://x/' + raw.slice(4).replace(/^\/+/, '')); } catch { return null; }
  const segs = url.pathname.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  const q = Object.fromEntries(url.searchParams.entries());
  return { action: (segs[0] || '').toLowerCase(), rest: segs.slice(1), arg: segs.slice(1).join('/'), q, href: raw };
}

function numberOrText(v) {
  const s = String(v).trim();
  return s !== '' && !isNaN(+s) ? +s : s;
}

export function followLink(host, href) {
  const L = parseLink(href);
  const bad = msg => { host.toast(msg, 'bad'); return false; };
  if (!L || !L.action) return bad(`unknown lab link ${href}`);
  const { action, arg, rest, q } = L;
  const program = host.program?.ok !== false ? host.program : host.lastGood;
  switch (action) {
    case 'preset': {
      const id = arg || q.id;
      if (!host.findPreset(id)) return bad(`no preset ${id}`);
      host.loadPreset(id);
      return true;
    }
    case 'run': case 'build': case 'compile':
      host.compile();
      return true;
    case 'view': case 'show': case 'tile': {
      const first = (rest[0] || '').toLowerCase();
      const camera = (q.view || q.name || (NAMED_VIEWS[first] ? first : '') || '').toLowerCase();
      const target = VIEW_IDS.includes(first) ? first : (q.show || (camera ? 'stage' : first || q.view));
      if (camera && !NAMED_VIEWS[camera] && action === 'view') return bad(`no stage view ${camera}`);
      if (target && !VIEW_IDS.includes(target)) return bad(`no view ${target}`);
      if (camera && NAMED_VIEWS[camera]) host.setView({ name: camera, ...(q.zoom ? { zoom: +q.zoom } : {}) });
      host.focus(target || 'stage');
      return true;
    }
    case 'sketch': {
      const id = arg || q.id || q.name || (program?.sketches?.[0]?.id);
      if (!id || !(program?.sketches || []).some(x => x.id === id)) return bad(`no sketch ${id || ''}`.trim());
      host.select(null);
      host.setView({ name: 'sketch', sketch: id, yaw: 0, pitch: 0, pan: [0, 0], zoom: 1, scale: null, target: null });
      host.focus('stage');
      return true;
    }
    case 'select': case 'node': case 'face': {
      const name = arg || q.id || q.name;
      if (!name) return bad('lab:select needs a name');
      if (findFace(program, name)) { host.select({ name }); host.focus(q.in || 'stage'); return true; }
      if (program?.graph?.nodes?.some(n => n.id === name)) { host.selectNode(name); host.focus(q.in || 'graph'); return true; }
      if (program?.params?.some(p => p.name === name)) { host.focus('params', { param: name }); return true; }
      return bad(`no face or node ${name}`);
    }
    case 'param': {
      let name = rest[0] || q.id || q.name, value = q.value;
      if (name && name.includes('=')) [name, value] = name.split(/=(.*)/s);
      if (!name) return bad('lab:param needs a name');
      if (program) { const r = resolveParamName(program.params, name); if (r.error) return bad(r.error); name = r.name; }
      if (value != null && value !== '') host.setOverride(name, numberOrText(value));
      host.focus('params', { param: name });
      return true;
    }
    case 'open': {
      const file = q.file || arg || 'script.js';
      if (!host.files.has(file)) return bad(`no file ${file}`);
      host.focus('code', { file, line: q.line ? +q.line : undefined, find: q.find });
      return true;
    }
    case 'doc': {
      const id = arg || q.id;
      if (id === 'reference') { host.focus('reference', { at: q.at }); return true; }
      if (!host.content.docs.some(d => d.id === id || d.key === id)) return bad(`no doc ${id}`);
      host.focus('docs', { id, at: q.at });
      return true;
    }
    case 'reference': host.focus('reference', { at: q.at || arg }); return true;
    case 'book': {
      const ch = arg || q.ch;
      if (ch && !host.content.chapters.some(c => c.n === String(ch))) return bad(`no chapter ${ch}`);
      host.focus('book', { ch: ch ? String(ch) : undefined, at: q.at });
      return true;
    }
    case 'overlay': {
      const name = arg || q.name;
      if (!name) return bad('lab:overlay needs a name');
      host.toggleOverlay(name, q.on == null ? undefined : q.on === '1' || q.on === 'true');
      host.focus('stage');
      return true;
    }
    case 'exp': case 'search': case 'experiment':
      host.focus('experiments', { run: arg || q.name || true });
      return true;
    case 'ask':
      host.focus('agent', { q: q.q || arg });
      host.emit('ask', q.q || arg);
      return true;
    case 'reset':
      host.resetOverrides();
      return true;
    default:
      return bad(`unknown lab link ${href}`);
  }
}
