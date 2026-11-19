// The two programs a study runs: TetGen (the mesher) and CalculiX (the solver).
//
// In a page, and in Node, they are WebAssembly modules built by tools/fea-wasm/build.sh (ES modules made by
// emscripten with MODULARIZE + EXPORT_ES6): tetgen.mjs/.wasm and ccx.mjs/.wasm, served from dist/fea/ beside the
// worker or read from vendor/fea/ in the source tree. Each run gets a fresh instance (CalculiX keeps its state in
// globals and was written as a one-shot process), with the input written to and the output read from the module's
// in-memory file system. In Node, JIG_TETGEN and JIG_CCX may name native executables instead.
//
// Without a CalculiX module the study is solved by the JavaScript reference solver (jsolve.js), and says so.

const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined';
let base = null;
const factories = new Map();

/** Where the modules are served from (a directory URL ending in '/'), set by the host. */
export function setAssets(url) { base = url ? String(url).replace(/\/?$/, '/') : null; factories.clear(); }

async function exists(u) {
  if (u.protocol === 'file:') { const fs = await import('node:fs'); return fs.existsSync(u); }
  try { const r = await fetch(u, { method: 'HEAD' }); return r.ok; } catch { return false; }
}
async function moduleUrl(name) {
  // the source tree keeps the emscripten output as .mjs (Node reads it as an ES module); dist/fea/ serves the same
  // files as .js, the type the page's host serves for scripts
  const js = name.replace(/\.mjs$/, '.js');
  // in Node, the source tree's vendor/fea first; in a page only dist/fea beside the worker (a probe of vendor/ from
  // dist/worker.js would 404, which the page's console reports as an error)
  const cands = base ? [new URL(js, base), new URL(name, base)]
    : isNode ? [new URL(`../../vendor/fea/${name}`, import.meta.url), new URL(`./fea/${js}`, import.meta.url)]
    : [new URL(`./fea/${js}`, import.meta.url)];
  for (const u of cands) if (await exists(u)) return u;
  return null;
}
async function factory(name) {
  if (factories.has(name)) return factories.get(name);
  const url = await moduleUrl(name);
  const f = url ? (await import(/* @vite-ignore */ url.href)).default : null;
  factories.set(name, f);
  return f;
}
const native = (v) => (isNode ? process.env[v] || null : null);

/** What is there to run: { tetgen: 'wasm' | 'native' | null, ccx: 'wasm' | 'native' | null } */
export async function available() {
  return {
    tetgen: native('JIG_TETGEN') ? 'native' : (await factory('tetgen.mjs')) ? 'wasm' : null,
    ccx: native('JIG_CCX') ? 'native' : (await factory('ccx.mjs')) ? 'wasm' : null,
  };
}

async function inTemp(files, run) {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-fea-'));
  try {
    for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, k), v);
    return await run(dir, (f) => { const p = path.join(dir, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
async function spawn(cmd, args, cwd) {
  const cp = await import('node:child_process');
  const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error) throw r.error;
  return { rc: r.status, log: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Mesh a PLC: → { node, ele, face } (TetGen's output files, as text) */
export async function tetgen(smesh, sw) {
  const exe = native('JIG_TETGEN');
  if (exe) return inTemp({ 'in.smesh': smesh }, async (dir, read) => {
    const { rc, log } = await spawn(exe, [sw, 'in.smesh'], dir);
    const out = { node: read('in.1.node'), ele: read('in.1.ele'), face: read('in.1.face') };
    if (rc !== 0 || !out.ele) throw new Error(`TetGen failed (exit ${rc}): ${lastLines(log)}`);
    return out;
  });
  const F = await factory('tetgen.mjs');
  if (!F) throw Object.assign(new Error('no TetGen module: build vendor/fea/tetgen.mjs with tools/fea-wasm/build.sh'), { kind: 'fea.noMesher' });
  const log = [];
  const M = await F({ print: (s) => log.push(s), printErr: (s) => log.push(s) });
  M.FS.writeFile('/in.smesh', smesh); M.FS.chdir('/');
  let rc = 0;
  try { rc = M.callMain([sw, 'in.smesh']) ?? 0; } catch (e) { if (e?.name === 'ExitStatus') rc = e.status; else throw e; }
  const read = (f) => { try { return M.FS.readFile(`/${f}`, { encoding: 'utf8' }); } catch { return null; } };
  const out = { node: read('in.1.node'), ele: read('in.1.ele'), face: read('in.1.face') };
  if (rc || !out.ele) throw new Error(`TetGen failed (exit ${rc}): ${lastLines(log.join('\n'))}`);
  return out;
}

/** Solve a deck: → { dat, log, version } */
export async function ccx(deck) {
  const exe = native('JIG_CCX');
  if (exe) return inTemp({ 'job.inp': deck }, async (dir, read) => {
    const { rc, log } = await spawn(exe, ['-i', 'job'], dir);
    const dat = read('job.dat');
    check(log, dat, rc);
    return { dat, log, version: versionOf(log) ?? 'native' };
  });
  const F = await factory('ccx.mjs');
  if (!F) throw Object.assign(new Error('no CalculiX module: build vendor/fea/ccx.mjs with tools/fea-wasm/build.sh'), { kind: 'fea.noSolver' });
  const out = [];
  const M = await F({ print: (s) => out.push(s), printErr: (s) => out.push(s) });
  M.FS.writeFile('/job.inp', deck); M.FS.chdir('/');
  let rc = 0;
  try { rc = M.ccall('fcweb_ccx_run', 'number', ['string'], ['job']); } catch (e) { if (e?.name === 'ExitStatus') rc = e.status; else throw e; }
  let dat = null; try { dat = M.FS.readFile('/job.dat', { encoding: 'utf8' }); } catch { /* none */ }
  const log = out.join('\n');
  check(log, dat, rc);
  return { dat, log, version: versionOf(log) ?? 'wasm' };
}
function check(log, dat, rc) {
  const errs = log.split('\n').filter((l) => /\*ERROR/.test(l));
  if (errs.length || !dat) throw new Error(`CalculiX failed${rc ? ` (exit ${rc})` : ''}: ${errs.length ? errs.slice(0, 3).join(' | ') : lastLines(log)}`);
}
const versionOf = (log) => /CalculiX Version ([\d.]+)/.exec(log)?.[1] ?? null;
const lastLines = (s) => String(s).trim().split('\n').slice(-4).join(' | ');
