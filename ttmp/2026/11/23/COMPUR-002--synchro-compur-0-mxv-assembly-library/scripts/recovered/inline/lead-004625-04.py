from pathlib import Path
p=Path('import/jigcad/src/ui/views/code.jsx')
s=p.read_text().replace('  const goTo = (line, f = cur) => {\n    if (f !== cur) { setFile(f); requestAnimationFrame(() => goTo(line, f)); return; }','''  const goTo = (line, f = cur) => {
    if (f !== cur) setFile(f);
    requestAnimationFrame(() => jumpToLine(line, f));
  };
  const jumpToLine = (line, f) => {''')
needle='          <hr />\n          <button disabled={!host.isEdited(cur)}'
assert needle in s
s=s.replace(needle,'''          <div class="newfile" data-keep>
            <select aria-label="Copy a published part file" value="" onChange={e => {
              const value = e.currentTarget.value;
              e.currentTarget.value = '';
              if (!value) return;
              const [id, name] = JSON.parse(value);
              const source = host.presetFiles(id)?.[name];
              if (typeof source === 'string' && host.addFile(name, source)) setFile(name);
            }}>
              <option value="">Copy a published part file…</option>
              {host.presets().filter(p => p.id !== pid).flatMap(p =>
                p.files.filter(name => name.endsWith('.parts.js')).map(name =>
                  <option key={p.id + '/' + name} value={JSON.stringify([p.id, name])}
                    disabled={host.files.has(name)}>{p.id} / {name}</option>))}
            </select>
          </div>
          <hr />
          <button disabled={!host.isEdited(cur)}''')
p.write_text(s)
for p in [Path('import/jigcad/content/docs/getting-started.md'),next(Path('ttmp/2026/11/23').glob('COMPUR*/design-doc/*.md'))]:
 s=p.read_text()
 i=s.index('Include that file') if 'Include that file' in s else s.index('This entry is enough')
 s=s[:i]+'''In the Code view, open **Files** and choose **Copy a published part file**.
Select the source preset and its `*.parts.js` file. Jig adds a project-local
copy and opens it for editing. Existing filenames are disabled. Copy any
sibling libraries the selected file imports as well.

'''+s[i:]
 p.write_text(s)
