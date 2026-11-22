// remote.ts — the workbench's OptiX mode (CANDELA-002 phase 5): a WebSocket client for `candela-rt serve` on the
// Spark. The browser keeps building every scene itself (editor, diagnostics, picking); it sends the same inputs —
// files, param values, the camera, the clock — and shows the frames the server streams back. Protocol: see the head
// of native/rt/src/serve.cpp.
import { digestString } from '../engine/digest';

export type RemoteState = 'connecting' | 'building' | 'compiling' | 'live' | 'taken' | 'closed' | 'error';
export interface RemoteFrame { t: number; spp: number; ev: number; width: number; height: number; renderMs: number; epoch: number; playing: boolean; denoise?: string; denoiseMs?: number }

/** the server's address: ?rt=ws://host:port in the page URL, else localStorage 'candela.rtUrl', else this host:8790 */
export function remoteUrl(): string {
  try {
    const q = new URLSearchParams(location.search).get('rt');
    if (q) return q;
    const s = localStorage.getItem('candela.rtUrl');
    if (s) return s;
  } catch { /* no storage */ }
  return `ws://${location.hostname || 'localhost'}:8790`;
}

export class RemoteRender {
  url: string;
  ws: WebSocket | null = null;
  state: RemoteState = 'connecting';
  message = '';
  server: any = null;
  built: any = null;
  /** the latest frame: its header and an object URL for its JPEG */
  frame: RemoteFrame | null = null;
  frameUrl: string | null = null;
  frames = 0;
  /** the browser's own program hash for the last files sent; differs from built.irHash → the two builds disagree */
  localHash = '';
  private closedByUser = false;
  private retry: any = null;
  private lastView = '';
  private lastClock = '';
  private fpsWindow: number[] = [];

  constructor(private onChange: () => void, private onHello: () => void, url = remoteUrl()) {
    this.url = url;
    this.connect();
  }

  get live() { return this.state === 'live' && !!this.frameUrl; }
  get mismatch() { return !!(this.built && this.built.ok && this.localHash && this.built.irHash !== this.localHash); }
  /** frames per second over the last two seconds */
  get fps() { const now = performance.now(); this.fpsWindow = this.fpsWindow.filter(t => now - t < 2000); return this.fpsWindow.length / 2; }

  connect() {
    this.state = 'connecting'; this.message = ''; this.onChange();
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch (e: any) { this.fail(String(e.message || e)); return; }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => { this.lastView = ''; this.lastClock = ''; this.send({ type: 'hello' }); };
    ws.onmessage = ev => (typeof ev.data === 'string' ? this.onText(ev.data) : this.onBinary(ev.data as ArrayBuffer));
    ws.onerror = () => { this.message = `no candela-rt at ${this.url}`; };
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) { this.state = 'closed'; this.onChange(); return; }
      this.state = 'error'; if (!this.message) this.message = 'connection closed'; this.onChange();
      clearTimeout(this.retry); this.retry = setTimeout(() => this.connect(), 2000);
    };
  }

  close() {
    this.closedByUser = true; clearTimeout(this.retry);
    if (this.ws) this.ws.close();
    if (this.frameUrl) URL.revokeObjectURL(this.frameUrl);
    this.frameUrl = null; this.frame = null; this.state = 'closed';
  }

  private fail(m: string) { this.state = 'error'; this.message = m; this.onChange(); }
  send(o: any) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }

  /** a (re)built scene: its files, the param values set so far, the clock; `compiledShared` for the hash check */
  sendFiles(files: Record<string, string>, params: Record<string, any>, time: number, seed: number, compiledShared?: string) {
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(files)) if (typeof v === 'string' && !k.startsWith('__')) f[k] = v;
    this.localHash = compiledShared ? digestString(compiledShared) : '';
    this.send({ type: 'files', files: f, params, time, seed });
  }
  sendParam(id: string, value: any) { this.send({ type: 'param', id, value }); }
  /** the camera override and the image size; sent only when they change */
  sendView(view: any, width: number, height: number) {
    const key = JSON.stringify([view, width, height]);
    if (key === this.lastView) return;
    this.lastView = key;
    this.send({ type: 'view', view, width, height });
  }
  sendClock(t: number, playing: boolean, rate = 1) {
    const key = JSON.stringify([playing ? 'play' : t, playing, rate]);
    if (key === this.lastClock) return;
    this.lastClock = key;
    this.send({ type: 'clock', t, playing, rate });
  }

  private onText(s: string) {
    let m: any; try { m = JSON.parse(s); } catch { return; }
    if (m.type === 'hello') { this.server = m; this.state = 'building'; this.onHello(); }
    else if (m.type === 'status' && m.state === 'taken') { this.state = 'taken'; this.message = 'another browser took over candela-rt; toggle OptiX to take it back'; }
    else if (m.type === 'status') { this.state = m.state === 'compiling' ? 'compiling' : 'building'; this.message = m.target ? `compiling for ${m.target}` : ''; }
    else if (m.type === 'built') { this.built = m; if (m.ok) { this.state = 'live'; this.message = ''; } else { this.state = 'error'; this.message = m.error; } }
    else if (m.type === 'error') { this.message = m.message; }
    this.onChange();
  }

  private onBinary(buf: ArrayBuffer) {
    const b = new Uint8Array(buf);
    const hl = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
    const head = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + hl))) as RemoteFrame;
    const url = URL.createObjectURL(new Blob([b.subarray(4 + hl)], { type: 'image/jpeg' }));
    const old = this.frameUrl;
    this.frame = head; this.frameUrl = url; this.frames++; this.fpsWindow.push(performance.now());
    if (this.state !== 'live' && this.state !== 'taken' && this.built && this.built.ok) this.state = 'live';
    this.onChange();
    // the <img> switches to the new URL on the next render; free the old one a little later
    if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
  }
}
