// The bundled content (presets, book chapters, shelf docs) as build.mjs writes it to src/generated/content.json.
// Tests may add fixtures before the app loads by setting globalThis.__JIG_CONTENT__ to the same shape.
import bundled from '../generated/content.json';

/** Split `---` frontmatter from a Markdown text: { meta, body }. Values are strings; lists stay strings. */
export function frontmatter(text = '') {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return { meta, body: text.slice(m[0].length) };
}

export const listOf = (v, sep = ',') => (Array.isArray(v) ? v : String(v ?? '').split(sep)).map(s => String(s).trim()).filter(Boolean);

function titleOf(body) {
  const m = /^#\s+(.+)$/m.exec(body);
  return m ? m[1].trim() : '';
}
function aboutOf(body) {
  // the lede: the first paragraph after the title
  const after = body.replace(/^#\s+.+$/m, '').trim();
  const para = after.split(/\n\s*\n/).find(p => p.trim() && !/^(#|>|```|\||-|\d+\.)/.test(p.trim()));
  return para ? para.replace(/\s+/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').slice(0, 160) : '';
}

function load() {
  const extra = globalThis.__JIG_CONTENT__ || {};
  const presets = [...(bundled.presets || [])];
  for (const p of extra.presets || []) if (!presets.some(q => q.id === p.id)) presets.push(p);
  // Test fixtures fill gaps only: once real chapters or docs are bundled, they win (the fixtures duplicated them).
  const book = [...(bundled.book?.length ? bundled.book : (extra.book || []))].sort((a, b) => a.file.localeCompare(b.file));
  const docsRaw = { ...(extra.docs || {}), ...(bundled.docs || {}) };

  const docs = Object.entries(docsRaw).map(([key, text], i) => {
    const { meta, body } = frontmatter(text);
    return {
      key, id: meta.id || key.replace(/^\d+-/, ''), title: meta.title || titleOf(body) || key,
      group: meta.group || 'Start here', about: meta.about || aboutOf(body),
      order: Number(meta.order ?? 1000 + i), text: body, meta,
    };
  }).sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

  const chapters = book.map((c, i) => {
    const { meta, body } = frontmatter(c.text);
    const num = meta.n ?? meta.chapter ?? (/^(\d+|[A-Z])(?=[-_.])/.exec(c.file)?.[1]?.replace(/^0+(?=\d)/, '')) ?? String(i + 1);
    return {
      file: c.file, n: String(num), title: meta.title || titleOf(body) || c.file, about: meta.about || aboutOf(body),
      part: meta.part || '', partAbout: meta.partAbout || meta['part-about'] || '',
      presets: listOf(meta.presets), docs: listOf(meta.docs), draft: meta.draft === 'true' || !body.trim(),
      book: meta.book || '', text: body, meta,
    };
  });
  return { presets, docs, chapters, bookTitle: chapters.find(c => c.book)?.book || 'The jig book' };
}

export const content = load();
