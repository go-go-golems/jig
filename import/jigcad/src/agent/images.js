// Images the person attaches to a message (JIG-006): each is drawn into a canvas and re-encoded as JPEG, the longest
// side at most 1568 px, quality 0.85 (slop-computer's prepare() rule; the backend accepts JPEG only, at most 4 per
// call and 8 MiB together). Browser only: createImageBitmap and a canvas.
export const MAX_ATTACH = 4;
export const MAX_SIDE = 1568;

/** Scale (w, h) so the longest side is at most max; whole pixels. */
export function fitSize(w, h, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

/** A File or Blob → { mimeType: 'image/jpeg', data: base64, width, height, url (a data URL for the thumbnail) }. */
export async function prepareImage(blob, { max = MAX_SIDE, quality = 0.85 } = {}) {
  const bmp = await createImageBitmap(blob);
  const [width, height] = fitSize(bmp.width, bmp.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);   // JPEG has no alpha: transparent PNGs go on white
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const url = canvas.toDataURL('image/jpeg', quality);
  return { mimeType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), width, height, url };
}

/** The image files of a paste or drop event's items. */
export function imageFiles(items) {
  const out = [];
  for (const it of items || []) {
    if (it.kind === 'file' && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) out.push(f); }
    else if (it instanceof Blob && /^image\//.test(it.type)) out.push(it);
  }
  return out;
}
