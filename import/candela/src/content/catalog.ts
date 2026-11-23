// catalog.ts — turn the raw content files (presets, docs, the API reference) into the data the workbench boots
// with. This is the logic the original build/build.js ran at bundle time; here it runs on a map of
// path → text so the browser (Vite's import.meta.glob) and Node (fs, for scripts/validate.ts) share it.
//
// Paths are relative to content/: 'presets/B-01-hello-sphere.md', 'presets/B-01-hello-sphere.js',
// 'presets/K-09-lockstitch/lockstitch-data.js', 'docs/01-tour.md', 'reference.md'.

export interface Preset {
  id: string;
  title: string;
  group: string;
  about: string;
  tries?: string[];
  docs?: string[];
  focus?: string[];
  /** project files: 'scene.js' plus optional 'lib/*.js' */
  files: Record<string, string>;
  notes: string;
  paused?: boolean;
  time?: number;
}

export interface Doc {
  id: string;
  title: string;
  group: string;
  about: string;
  order: number;
  body: string;
}

export interface CandelaData {
  presets: Preset[];
  docs: Doc[];
  reference: string;
}

export const GROUPS = ['Basics', 'Light', 'Materials', 'Algebra', 'Fields', 'Geometry', 'Media', 'Spectral', 'Camera', 'Engines', 'GPU', 'Live', 'Scenes', 'Machines', 'Diagnostics'];

export function frontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([\w-]+):\s*(.*)$/);
    if (k) meta[k[1]] = k[2].trim();
  }
  return { meta, body: src.slice(m[0].length) };
}

const list = (s: string | undefined, sep = ','): string[] => (s ? s.split(sep).map(x => x.trim()).filter(Boolean) : []);
const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function loadPresets(content: Record<string, string>): Preset[] {
  const out: Preset[] = [];
  const mds = Object.keys(content).filter(p => /^presets\/[^/]+\.md$/.test(p)).sort();
  for (const mdPath of mds) {
    const f = basename(mdPath);
    const { meta, body } = frontmatter(content[mdPath]);
    const id = meta.id;
    if (!id) throw new Error(f + ': no id');
    const base = f.replace(/\.md$/, '');
    const files: Record<string, string> = {};
    const js = content[`presets/${base}.js`];
    if (js == null) throw new Error(`${f}: missing ${base}.js`);
    files['scene.js'] = js;
    const libPrefix = `presets/${base}/`;
    for (const p of Object.keys(content).filter(p => p.startsWith(libPrefix)).sort()) files['lib/' + p.slice(libPrefix.length)] = content[p];
    if (!GROUPS.includes(meta.group)) throw new Error(`${id}: unknown group ${meta.group}`);
    out.push({
      id, title: meta.title, group: meta.group, about: meta.about || '', tries: list(meta.tries, '|'), docs: list(meta.docs), focus: list(meta.focus),
      files, notes: body.trim() + '\n', paused: meta.paused === 'true', time: meta.time != null ? +meta.time : 0,
    });
  }
  out.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const ids = new Set<string>();
  for (const p of out) {
    if (ids.has(p.id)) throw new Error('duplicate preset id ' + p.id);
    ids.add(p.id);
  }
  return out;
}

export function loadDocs(content: Record<string, string>): Doc[] {
  const out: Doc[] = [];
  for (const p of Object.keys(content).filter(p => /^docs\/[^/]+\.md$/.test(p)).sort()) {
    const { meta, body } = frontmatter(content[p]);
    out.push({ id: meta.id, title: meta.title, group: meta.group, about: meta.about || '', order: +(meta.order || 50), body: body.trim() + '\n' });
  }
  return out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function checkDocRefs(presets: Preset[], docs: Doc[]): void {
  const ids = new Set(docs.map(d => d.id));
  for (const p of presets) for (const d of p.docs || []) if (!ids.has(d)) throw new Error(`${p.id}: unknown doc '${d}'`);
}

export function loadCatalog(content: Record<string, string>): CandelaData {
  const presets = loadPresets(content), docs = loadDocs(content);
  checkDocRefs(presets, docs);
  const reference = content['reference.md'];
  if (reference == null) throw new Error('content/reference.md is missing');
  return { presets, docs, reference };
}
