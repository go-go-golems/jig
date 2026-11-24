from pathlib import Path
p=Path('import/jigcad/test/render/compur.test.mjs').resolve()
s=p.read_text().split("test('M-11 compiles:")[0].replace("new URL('../engine/loader.mjs', import.meta.url).href",repr((p.parent.parent/'engine/loader.mjs').as_uri())).replace("join(dirname(fileURLToPath(import.meta.url)), '../..')",repr(str(p.parents[2]))).replace("from '../../","from '../../")
for key in ('../../src/engine/worker.js','../../src/engine/cadpkg.js','../../dist/candela.js'):
 s=s.replace("'"+key+"'",repr((p.parent/key).resolve().as_uri()))
s=s.replace("before(async () => {","await (async () => {").replace('pkg = JSON.parse(e.data);\n});','pkg = JSON.parse(e.data);\n})();')
s+="\n; const fs=await import('node:fs'); fs.writeFileSync('/tmp/ctrl-meta.json',JSON.stringify(pkg.bodies.map(b=>({c:b.component,faces:b.faces})))); const r=await buildLook(); console.log('materials',r.compiled.materials.length,'shared',r.compiled.shared.length);"
Path('/tmp/ctrl-debug.mjs').write_text(s)
