// Saving exports (src/ui/save.js): outside claude.ai the page downloads through a Blob and a clicked <a download>;
// inside claude.ai the runtime's downloads capability decides. node --test test/ui/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserDownloads, stlToASCII } from '../../src/ui/save.js';

function fakeDocument() {
  const clicks = [];
  const body = { children: [], appendChild(el) { this.children.push(el); }, };
  return {
    clicks, body,
    createElement(tag) {
      const el = { tag, style: {}, remove() { body.children = body.children.filter(c => c !== el); }, click() { clicks.push({ href: el.href, download: el.download, inBody: body.children.includes(el) }); } };
      return el;
    },
  };
}

test('a browser download saves binary and text through an object URL and a clicked <a download>', async () => {
  const doc = fakeDocument();
  const blobs = [];
  const orig = URL.createObjectURL;
  URL.createObjectURL = b => { blobs.push(b); return `blob:test/${blobs.length}`; };
  try {
    const dl = browserDownloads(doc);
    assert.equal(dl.kind, 'browser');
    const stl = new Uint8Array(84 + 50); new DataView(stl.buffer).setUint32(80, 1, true);
    await dl.save({ filename: 'box.stl', data: stl, mime: 'model/stl' });
    await dl.save({ filename: 'box.step', data: 'ISO-10303-21;', mime: 'model/step' });
    assert.deepEqual(doc.clicks.map(c => [c.download, c.href, c.inBody]), [['box.stl', 'blob:test/1', true], ['box.step', 'blob:test/2', true]]);
    assert.equal(doc.body.children.length, 0, 'the link is removed after the click');
    assert.equal(blobs[0].size, 134); assert.equal(blobs[0].type, 'model/stl');
    assert.equal(await blobs[1].text(), 'ISO-10303-21;');
  } finally { URL.createObjectURL = orig; }
});

test('no document, no browser download', () => {
  assert.equal(browserDownloads(null), null);
});

test('stlToASCII writes one facet per triangle', () => {
  const b = new ArrayBuffer(84 + 50); const dv = new DataView(b);
  dv.setUint32(80, 1, true); dv.setFloat32(84 + 8, 1, true); dv.setFloat32(84 + 24, 1, true);
  const t = stlToASCII(b, 'p');
  assert.match(t, /^solid p\n  facet normal 0\.00000 0\.00000 1\.00000/);
  assert.equal((t.match(/vertex/g) || []).length, 3);
});
