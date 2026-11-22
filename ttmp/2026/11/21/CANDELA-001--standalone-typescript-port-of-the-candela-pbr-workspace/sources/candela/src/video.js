// video.js — frame sequences as video files: WebCodecs encodes (H.264 for MP4, VP9 or VP8 for WebM) and two
// small muxers written here write the containers — ISO BMFF (MP4, "fast start": the index before the data) and
// Matroska/WebM (with cues, so players can seek). Frames are added one at a time as they are rendered.
import { CandelaError } from './diag.js';

// ---------- codec choice ----------
// H.264 level from the frame size in macroblocks and the macroblock rate (Rec. H.264 Table A-1)
const AVC_LEVELS = [[30, 1620, 40500], [31, 3600, 108000], [32, 5120, 216000], [40, 8192, 245760], [42, 8704, 522240], [50, 22080, 589824], [51, 36864, 983040], [52, 36864, 2073600], [60, 139264, 4177920], [61, 139264, 8355840], [62, 139264, 16711680]];
function avcLevel(w, h, fps) { const mbs = Math.ceil(w / 16) * Math.ceil(h / 16); const L = AVC_LEVELS.find(([, f, r]) => mbs <= f && mbs * fps <= r) || AVC_LEVELS[AVC_LEVELS.length - 1]; return L[0].toString(16).padStart(2, '0'); }
function vp9Level(w, h) { const n = w * h; return n <= 983040 ? '31' : n <= 2228224 ? '41' : n <= 8912896 ? '51' : '61'; }
const candidates = (container, w, h, fps) => container === 'mp4'
  ? [`avc1.6400${avcLevel(w, h, fps)}`, `avc1.4d00${avcLevel(w, h, fps)}`, `avc1.4200${avcLevel(w, h, fps)}`]
  : [`vp09.00.${vp9Level(w, h)}.08`, 'vp8'];
const hasWebCodecs = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

// what this browser can write: { mp4: codec | null, webm: codec | null }
export async function videoSupport(w = 1280, h = 720, fps = 24) {
  const out = { mp4: null, webm: null };
  if (!hasWebCodecs()) return out;
  for (const c of ['mp4', 'webm']) for (const codec of candidates(c, w, h, fps)) {
    try { const s = await VideoEncoder.isConfigSupported(encCfg(codec, w, h, fps, 4e6)); if (s.supported) { out[c] = codec; break; } } catch (e) { /* try the next */ }
  }
  return out;
}
function encCfg(codec, width, height, fps, bitrate) {
  const c = { codec, width, height, bitrate: Math.round(bitrate), framerate: fps, latencyMode: 'quality', bitrateMode: 'variable' };
  if (codec.startsWith('avc1')) c.avc = { format: 'avc' };
  return c;
}
// bits per pixel per frame for each quality; path-traced frames carry fine noise, so be generous
export const VIDEO_QUALITY = { draft: 0.06, standard: 0.12, high: 0.22, max: 0.4 };
export const videoBitrate = (w, h, fps, quality = 'high') => w * h * fps * (VIDEO_QUALITY[quality] || VIDEO_QUALITY.high);

// ---------- the writer ----------
export class VideoWriter {
  // o: { container: 'mp4' | 'webm', width, height, fps, bitrate (bits/s) | quality, keyframeInterval (s) }
  static async create(o) {
    if (!hasWebCodecs()) throw new CandelaError('E730', 'video export needs WebCodecs (Chrome, Edge, Safari 17+, Firefox 130+); render PNG frames instead', { hint: 'the frames can be joined later: ffmpeg -framerate 24 -i name.%04d.png -pix_fmt yuv420p name.mp4' });
    const container = o.container === 'webm' ? 'webm' : 'mp4';
    const { width: w, height: h } = o, fps = o.fps || 24;
    if (w % 2 || h % 2) throw new CandelaError('E121', `video: ${w}×${h} — width and height must be even`);
    const bitrate = o.bitrate || videoBitrate(w, h, fps, o.quality);
    let codec = null;
    for (const c of candidates(container, w, h, fps)) { try { const s = await VideoEncoder.isConfigSupported(encCfg(c, w, h, fps, bitrate)); if (s.supported) { codec = c; break; } } catch (e) { /* next */ } }
    if (!codec) throw new CandelaError('E730', `this browser cannot encode ${container === 'mp4' ? 'H.264 (MP4)' : 'VP9 or VP8 (WebM)'} at ${w}×${h}`, { hint: container === 'mp4' ? 'try WebM, or PNG frames' : 'try MP4, or PNG frames' });
    return new VideoWriter(container, codec, w, h, fps, bitrate, o.keyframeInterval || 2);
  }
  constructor(container, codec, w, h, fps, bitrate, kfi) {
    Object.assign(this, { container, codec, width: w, height: h, fps, bitrate, chunks: [], desc: null, colorSpace: null, error: null, n: 0 });
    this.keyEvery = Math.max(1, Math.round(kfi * fps));
    this.enc = new VideoEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        this.chunks.push({ data, key: chunk.type === 'key', ts: chunk.timestamp });
        const dc = meta && meta.decoderConfig;
        if (dc) { if (dc.description) this.desc = new Uint8Array(dc.description instanceof ArrayBuffer ? dc.description.slice(0) : dc.description.buffer.slice(dc.description.byteOffset, dc.description.byteOffset + dc.description.byteLength)); if (dc.colorSpace) this.colorSpace = dc.colorSpace; }
      },
      error: e => { this.error = e; },
    });
    this.enc.configure(encCfg(codec, w, h, fps, bitrate));
    this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.ctx = this.canvas.getContext('2d');
  }
  // one frame: ImageData (the display, tone-mapped), a canvas, or anything VideoFrame takes
  async add(src) {
    if (this.error) throw new CandelaError('E730', 'video encoder: ' + this.error.message);
    let source = src;
    if (typeof ImageData !== 'undefined' && src instanceof ImageData) {
      if (src.width === this.width && src.height === this.height) this.ctx.putImageData(src, 0, 0);
      else { const t = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(src.width, src.height) : Object.assign(document.createElement('canvas'), { width: src.width, height: src.height }); t.getContext('2d').putImageData(src, 0, 0); this.ctx.drawImage(t, 0, 0, this.width, this.height); }
      source = this.canvas;
    }
    const k = this.n++;
    const frame = new VideoFrame(source, { timestamp: Math.round(k * 1e6 / this.fps), duration: Math.round(1e6 / this.fps) });
    this.enc.encode(frame, { keyFrame: k % this.keyEvery === 0 });
    frame.close();
    // the renderer is far slower than the encoder, but keep the queue short anyway
    while (this.enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 5));
  }
  async finish() {
    await this.enc.flush();
    if (this.error) throw new CandelaError('E730', 'video encoder: ' + this.error.message);
    this.enc.close();
    if (!this.chunks.length) throw new CandelaError('E730', 'video: no frames were encoded');
    const o = { width: this.width, height: this.height, fps: this.fps, chunks: this.chunks, colorSpace: this.colorSpace, codec: this.codec };
    if (this.container === 'mp4') { if (!this.desc) throw new CandelaError('E730', 'video: the H.264 encoder gave no decoder configuration'); return muxMP4(Object.assign(o, { description: this.desc })); }
    return muxWebM(o);
  }
  close() { try { if (this.enc.state !== 'closed') this.enc.close(); } catch (e) { /* closed */ } }
}

// ---------- colour metadata: WebCodecs names → ISO/IEC 23091-2 code points ----------
const PRIM = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
const TRC = { bt709: 1, smpte170m: 6, linear: 8, 'iec61966-2-1': 13, pq: 16, hlg: 18 };
const MTX = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 };
const colourCodes = cs => (cs && cs.primaries && cs.transfer && cs.matrix && PRIM[cs.primaries] != null && TRC[cs.transfer] != null && MTX[cs.matrix] != null ? { p: PRIM[cs.primaries], t: TRC[cs.transfer], m: MTX[cs.matrix], full: !!cs.fullRange } : null);

// ---------- byte helpers ----------
const cat = parts => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
const u8 = (...v) => Uint8Array.from(v);
const be = (v, n) => { const o = new Uint8Array(n); for (let i = n - 1; i >= 0; i--) { o[i] = v % 256; v = Math.floor(v / 256); } return o; };
const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0));

// ---------- MP4 (ISO BMFF) ----------
const box = (type, ...parts) => { const body = cat(parts.flat()); return cat([be(body.length + 8, 4), ascii(type), body]); };
const full = (type, version, flags, ...parts) => box(type, u8(version), be(flags, 3), ...parts);
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(v => be(v, 4));
export function muxMP4({ width, height, fps, chunks, description, colorSpace }) {
  const timescale = Math.round(fps * 1000), delta = 1000, N = chunks.length, dur = N * delta;
  // presentation vs decode order: chunks arrive in decode order; offsets only if the encoder reordered frames
  const pts = chunks.map(c => Math.round(c.ts * timescale / 1e6)), dts = pts.slice().sort((a, b) => a - b);
  const reordered = pts.some((p, i) => p !== dts[i]);
  const cs = colourCodes(colorSpace);
  const stbl = offset => box('stbl',
    full('stsd', 0, 0, be(1, 4), box('avc1', new Uint8Array(6), be(1, 2), new Uint8Array(16), be(width, 2), be(height, 2), be(0x00480000, 4), be(0x00480000, 4), be(0, 4), be(1, 2),
      cat([u8(7), ascii('Candela'), new Uint8Array(24)]), be(0x18, 2), u8(0xff, 0xff),
      box('avcC', description),
      cs ? box('colr', ascii('nclx'), be(cs.p, 2), be(cs.t, 2), be(cs.m, 2), u8(cs.full ? 0x80 : 0)) : [],
      box('pasp', be(1, 4), be(1, 4)))),
    full('stts', 0, 0, be(1, 4), be(N, 4), be(delta, 4)),
    chunks.some(c => !c.key) ? full('stss', 0, 0, be(chunks.filter(c => c.key).length, 4), ...chunks.map((c, i) => (c.key ? be(i + 1, 4) : null)).filter(Boolean)) : [],
    reordered ? full('ctts', 1, 0, be(N, 4), ...pts.map((p, i) => cat([be(1, 4), (() => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, p - dts[i]); return b; })()]))) : [],
    full('stsc', 0, 0, be(1, 4), be(1, 4), be(N, 4), be(1, 4)),
    full('stsz', 0, 0, be(0, 4), be(N, 4), ...chunks.map(c => be(c.data.length, 4))),
    full('stco', 0, 0, be(1, 4), be(offset, 4)));
  const moov = offset => box('moov',
    full('mvhd', 0, 0, be(0, 4), be(0, 4), be(timescale, 4), be(dur, 4), be(0x00010000, 4), be(0x0100, 2), new Uint8Array(10), MATRIX, new Uint8Array(24), be(2, 4)),
    box('trak',
      full('tkhd', 0, 3, be(0, 4), be(0, 4), be(1, 4), be(0, 4), be(dur, 4), new Uint8Array(8), be(0, 2), be(0, 2), be(0, 2), be(0, 2), MATRIX, be(width * 65536, 4), be(height * 65536, 4)),
      box('mdia',
        full('mdhd', 0, 0, be(0, 4), be(0, 4), be(timescale, 4), be(dur, 4), be(0x55c4, 2), be(0, 2)),
        full('hdlr', 0, 0, be(0, 4), ascii('vide'), new Uint8Array(12), ascii('Candela video'), u8(0)),
        box('minf',
          full('vmhd', 0, 1, new Uint8Array(8)),
          box('dinf', full('dref', 0, 0, be(1, 4), full('url ', 0, 1))),
          stbl(offset)))));
  const ftyp = box('ftyp', ascii('isom'), be(512, 4), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'));
  let size = 0; for (const c of chunks) size += c.data.length;
  if (size + 8 > 0xffffffff) throw new CandelaError('E121', 'mp4: more than 4 GB of video — lower the bitrate or split the sequence');
  // "fast start": the index first, so a player can begin before the whole file has arrived
  const m0 = moov(0), offset = ftyp.length + m0.length + 8;
  const m = moov(offset);
  return cat([ftyp, m, be(size + 8, 4), ascii('mdat'), ...chunks.map(c => c.data)]);
}

// ---------- WebM (Matroska) ----------
const ebmlId = id => { const n = id >= 0x1000000 ? 4 : id >= 0x10000 ? 3 : id >= 0x100 ? 2 : 1; return be(id, n); };
const size8 = n => { const b = be(n, 8); b[0] = 0x01; return b; };                       // an 8-byte EBML length
const el = (id, ...parts) => { const body = cat(parts.flat()); return cat([ebmlId(id), size8(body.length), body]); };
const uint = (id, v, n) => { let k = n || 1; if (!n) while (k < 8 && v >= 2 ** (8 * k)) k++; return el(id, be(v, k)); };
const f64 = (id, v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b); };
const str = (id, s) => el(id, new TextEncoder().encode(s));
export function muxWebM({ width, height, fps, chunks, colorSpace, codec }) {
  const ms = c => Math.round(c.ts / 1000), dur = chunks.length * 1000 / fps;
  const cs = colourCodes(colorSpace);
  const header = el(0x1a45dfa3, uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8), str(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2));
  const info = el(0x1549a966, uint(0x2ad7b1, 1000000), f64(0x4489, dur), str(0x4d80, 'Candela'), str(0x5741, 'Candela'));
  const video = el(0xe0, uint(0xb0, width), uint(0xba, height), cs ? el(0x55b0, uint(0x55b1, cs.m), uint(0x55b9, cs.full ? 2 : 1), uint(0x55ba, cs.t), uint(0x55bb, cs.p)) : []);
  const tracks = el(0x1654ae6b, el(0xae, uint(0xd7, 1), uint(0x73c5, 1), uint(0x83, 1), str(0x86, codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8'), uint(0x23e383, Math.round(1e9 / fps)), video));
  // clusters: one per keyframe (and at least every 30 s, so block offsets fit in 16 bits)
  const clusters = []; let cur = null;
  chunks.forEach(c => {
    const t = ms(c);
    if (!cur || c.key || t - cur.t > 30000) { cur = { t, blocks: [] }; clusters.push(cur); }
    const rel = new Uint8Array(2); new DataView(rel.buffer).setInt16(0, t - cur.t);
    cur.blocks.push(el(0xa3, u8(0x81), rel, u8(c.key ? 0x80 : 0), c.data));
  });
  const cl = clusters.map(k => ({ t: k.t, bytes: el(0x1f43b675, uint(0xe7, k.t), ...k.blocks) }));
  // cues and the seek head use fixed-width positions, so their sizes do not depend on the positions
  const cues = at => el(0x1c53bb6b, ...cl.map((k, i) => el(0xbb, uint(0xb3, k.t, 8), el(0xb7, uint(0xf7, 1), uint(0xf1, at[i], 8)))));
  const seek = (info0, tracks0, cues0) => el(0x114d9b74, ...[[0x1549a966, info0], [0x1654ae6b, tracks0], [0x1c53bb6b, cues0]].map(([id, p]) => el(0x4dbb, el(0x53ab, ebmlId(id)), uint(0x53ac, p, 8))));
  const seekLen = seek(0, 0, 0).length, cuesLen = cues(cl.map(() => 0)).length;
  const pInfo = seekLen, pTracks = pInfo + info.length, pCues = pTracks + tracks.length;
  let p = pCues + cuesLen; const at = cl.map(k => { const a = p; p += k.bytes.length; return a; });
  const body = cat([seek(pInfo, pTracks, pCues), info, tracks, cues(at), ...cl.map(k => k.bytes)]);
  return cat([header, ebmlId(0x18538067), size8(body.length), body]);
}
