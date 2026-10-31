import fs from 'node:fs';
import zlib from 'node:zlib';
const raw = fs.readFileSync('/home/claude/jigcad/vendor/occt/replicad_single.wasm');
const gz = fs.readFileSync('/home/claude/jigcad/dist/occt/replicad_single.gz.wasm');
console.log('raw bytes', raw.length, 'gz bytes', gz.length, 'ratio', (raw.length/gz.length).toFixed(2));
// gzip -9 and brotli for comparison
let t = performance.now();
const br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
console.log('brotli q11 bytes', br.length, 'ms', (performance.now()-t).toFixed(0));
t = performance.now();
const g9 = zlib.gzipSync(raw, { level: 9 });
console.log('gzip -9 bytes', g9.length, 'ms', (performance.now()-t).toFixed(0));
// decompression time: zlib sync and DecompressionStream
for (let k = 0; k < 3; k++) {
  t = performance.now();
  const u = zlib.gunzipSync(gz);
  const a = performance.now() - t;
  t = performance.now();
  const s = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
  const u2 = new Uint8Array(await new Response(s).arrayBuffer());
  const b = performance.now() - t;
  t = performance.now();
  const m = await WebAssembly.compile(u2);
  const c = performance.now() - t;
  console.log(`gunzipSync ${a.toFixed(0)} ms, DecompressionStream ${b.toFixed(0)} ms (${u2.length} B), WebAssembly.compile ${c.toFixed(0)} ms`);
  if (k === 0) {
    const imps = WebAssembly.Module.imports(m);
    const exps = WebAssembly.Module.exports(m);
    console.log('imports', imps.length, 'exports', exps.length);
    console.log(imps.filter(i => i.kind !== 'function'));
    console.log(exps.filter(i => i.kind !== 'function'));
  }
}
