from pathlib import Path
import re
p=next(Path('import/jigcad/content/presets').glob('M-11*/script.js'))
s=p.read_text()
lib,assembly=s.split("return j.assembly(",1)
names=re.findall(r'^const P_(\w+) =',lib,re.M)
lib=re.sub(r'^const P_(\w+) = \(\(\) => \{',r'const \1 = () => (() => {',lib,flags=re.M)
lib=lib[lib.index('const brass'):]
(p.parent/'compur.parts.js').write_text('// Synchro-Compur component factories. Each call produces a fresh builder in assembly coordinates.\n'+lib+'return { '+', '.join(names)+' }\n')
p.write_text(s[:s.index('const brass')]+"const parts = await importPartFile('compur.parts.js')\nreturn j.assembly("+re.sub(r'\bP_(\w+)',r'parts.\1()',assembly))
p=Path('import/jigcad/src/engine/worker.js')
s=p.read_text().replace('catch (e) { throw scriptError(e, code, file); }','catch (e) { throw e.info ? e : scriptError(e, code, file); }').replace('(script.js:${err.line}', '(${file}:${err.line}')
s=s.replace("  try { model = await runScript(code, { data: d, file: entry, extra: scriptLog(logs) }); }",'''  const logger = scriptLog(logs);
  // Resolve exact project keys, including in offline copies. Each import evaluates a new module scope.
  function evaluate(file, ancestors) {
    const importPartFile = async name => {
      if (typeof name !== 'string' || !name.endsWith('.js') || !Object.hasOwn(files, name))
        throw new Error(`Unknown part file: ${name}`);
      if (ancestors.includes(name)) throw new Error(`Circular part import: ${[...ancestors, name].join(' -> ')}`);
      return evaluate(name, [...ancestors, name]);
    };
    return runScript(files[file], { data: d, file, extra: { ...logger, importPartFile } });
  }
  try { model = await evaluate(entry, [entry]); }''')
p.write_text(s)
print('Factories:',names)
