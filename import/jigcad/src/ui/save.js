// Saving files. Inside claude.ai the runtime's downloads capability saves them (runtime-capabilities.md): claude.use()
// is asked once and resolves to null when not granted; the artifact frame cannot start downloads by itself, so then
// text goes to the clipboard. Outside claude.ai (jigcad serve, a static host) the page saves with an ordinary
// browser download: a Blob behind an object URL and a clicked <a download>.
let downloadsPromise = null;

/** The browser's own download: works in any top-level page or frame allowed to download. */
export function browserDownloads(doc = globalThis.document) {
  if (!doc || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Blob === 'undefined') return null;
  return {
    kind: 'browser',
    async save({ filename, data, mime }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime || (typeof data === 'string' ? 'text/plain' : 'application/octet-stream') });
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
      doc.body.appendChild(a);
      try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    },
  };
}

export function downloads() {
  if (!downloadsPromise) downloadsPromise = new Promise(r => setTimeout(r, 0)).then(async () => {
    if (globalThis.claude) {
      try { return globalThis.claude.use ? (await globalThis.claude.use('downloads')) || null : null; } catch { return null; }
    }
    return browserDownloads();
  });
  return downloadsPromise;
}

/** Save `data` as `filename`, or copy it when saving is not available. Reports with a toast either way. */
export async function saveOrCopy(host, filename, data, note = '', mime = '') {
  const dl = await downloads();
  if (dl) {
    try { await dl.save({ filename, data, ...(mime ? { mime } : {}) }); host.toast(`${dl.kind === 'browser' ? 'Downloaded' : 'Saved'} ${filename}${note}`); return true; }
    catch (e) { host.toast(`${filename} was not saved: ${e?.message || 'the download was declined'}`, 'bad'); return false; }
  }
  if (typeof data === 'string') {
    try { await navigator.clipboard.writeText(data); host.toast(`Saving files is not available here: ${filename} was copied to the clipboard instead`); return true; }
    catch { host.toast(`Saving files is not available here, and the clipboard refused ${filename}`, 'bad'); return false; }
  }
  host.toast(`Saving files is not available here, and ${filename} is binary, so it cannot be copied`, 'bad');
  return false;
}

/** A binary STL as ASCII STL text, so the clipboard fallback can carry it. */
export function stlToASCII(buf, name = 'part') {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);
  const n = dv.getUint32(80, true), out = [`solid ${name}`];
  const f = o => dv.getFloat32(o, true).toFixed(5);
  for (let t = 0, p = 84; t < n; t++, p += 50) {
    out.push(`  facet normal ${f(p)} ${f(p + 4)} ${f(p + 8)}`, '    outer loop');
    for (let k = 1; k <= 3; k++) out.push(`      vertex ${f(p + 12 * k)} ${f(p + 12 * k + 4)} ${f(p + 12 * k + 8)}`);
    out.push('    endloop', '  endfacet');
  }
  out.push(`endsolid ${name}`);
  return out.join('\n');
}
