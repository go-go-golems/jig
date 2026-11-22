// capture.js — a picture of the whole workbench: the DOM cloned into an SVG foreignObject with the page's own
// stylesheets, canvases swapped for their pixels, scroll positions kept, then rasterised onto a canvas.
export async function captureWorkbench(host, maxW = 1400) {
  const root = document.getElementById('app');
  const rect = root.getBoundingClientRect();
  const W = Math.round(rect.width), H = Math.round(rect.height);
  const clone = root.cloneNode(true);
  // canvases: the viewport through the renderer's readback, others through toDataURL
  const src = [...root.querySelectorAll('canvas')], dst = [...clone.querySelectorAll('canvas')];
  for (let i = 0; i < src.length; i++) {
    let url = null;
    try { url = src[i] === host.canvas && host.vp ? (await host.screenshotViewport(2000)).toDataURL('image/jpeg', 0.9) : src[i].toDataURL(); } catch (e) { url = null; }
    const r = src[i].getBoundingClientRect();
    const img = document.createElement('img');
    if (url) img.setAttribute('src', url);
    img.setAttribute('style', `width:${r.width}px;height:${r.height}px;display:block;position:${getComputedStyle(src[i]).position};inset:0`);
    dst[i].replaceWith(img);
  }
  // form state and scroll positions
  const sAll = [...root.querySelectorAll('*')], dAll = [...clone.querySelectorAll('*')];
  for (let i = 0; i < sAll.length && i < dAll.length; i++) {
    const s = sAll[i], d = dAll[i];
    if (s.tagName === 'TEXTAREA') d.textContent = s.value;
    else if (s.tagName === 'INPUT' && s.type !== 'file') d.setAttribute('value', s.value);
    else if (s.tagName === 'SELECT') { const o = d.querySelectorAll('option')[s.selectedIndex]; if (o) o.setAttribute('selected', 'selected'); }
    if ((s.scrollTop || s.scrollLeft) && d.children.length) { d.style.overflow = 'hidden'; for (const c of d.children) c.style.transform = `translate(${-s.scrollLeft}px, ${-s.scrollTop}px)`; }
  }
  const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n').replace(/@import[^;]+;/g, '');
  const theme = document.documentElement.dataset.theme;
  const bg = getComputedStyle(document.body).backgroundColor, fg = getComputedStyle(document.body).color;
  const xhtml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"${theme ? ` data-theme="${theme}"` : ''}><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;overflow:hidden;background:${bg};color:${fg};font:400 12px/1.45 Arial, Helvetica, sans-serif"><style>${css.replace(/<\/style/gi, '<\\/style')}</style>${xhtml}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const k = Math.min(1, maxW / W);
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  // a tainted canvas (some browsers taint foreignObject drawings) would throw here: fall back to the viewport
  try { c.getContext('2d').getImageData(0, 0, 1, 1); } catch (e) { return host.screenshotViewport(maxW); }
  return c;
}
