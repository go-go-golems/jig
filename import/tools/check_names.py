"""Reconcile API names used in the examples against the README contract.

Usage: python3 check_names.py <jig dir>
Prints j.* paths and .method names that appear in examples but nowhere in README.md.
"""
import re, sys, pathlib, collections

root = pathlib.Path(sys.argv[1])
readme = (root / 'README.md').read_text()
examples = sorted((root / 'examples').glob('*.js'))

path_re = re.compile(r'\bj\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)')
method_re = re.compile(r'\.([A-Za-z_$][\w$]*)\s*\(')

readme_paths = set(path_re.findall(readme))
readme_words = set(re.findall(r'[A-Za-z_$][\w$]*', readme))

def strip_comments(src):
    # drop // comments and /* */ blocks so results in "// →" don't count as API use
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    return '\n'.join(re.sub(r'(^|[^:])//.*$', r'\1', line) for line in src.splitlines())

missing_paths = collections.defaultdict(set)
missing_methods = collections.defaultdict(set)
js_builtins = {'map', 'filter', 'find', 'reduce', 'forEach', 'slice', 'sort', 'push', 'join', 'includes', 'some',
               'every', 'flatMap', 'entries', 'keys', 'values', 'toFixed', 'toString', 'split', 'trim', 'startsWith',
               'endsWith', 'replace', 'log', 'floor', 'ceil', 'round', 'max', 'min', 'abs', 'sqrt', 'PI', 'fromEntries',
               'concat', 'indexOf', 'repeat', 'padStart', 'padEnd', 'random', 'pow', 'hypot', 'sin', 'cos', 'tan',
               'atan2', 'freeze', 'assign', 'stringify', 'parse', 'then', 'catch', 'at', 'has', 'get', 'set', 'add',
               'delete', 'all', 'from', 'isArray', 'test', 'match', 'matchAll', 'exec', 'sum', 'length', 'cbrt', 'log10',
               'exp', 'trunc', 'sign', 'toUpperCase', 'toLowerCase', 'localeCompare', 'reverse', 'fill', 'findIndex',
               'lastIndexOf', 'shift', 'unshift', 'splice', 'flat', 'groupBy'}

for f in examples:
    src = strip_comments(f.read_text())
    for p in path_re.findall(src):
        # accept if the path or any prefix-extension is in README (j.lib.snap.cantilever etc.)
        prefix, _, last = p.rpartition('.')
        prefix_known = bool(prefix) and any(rp == prefix or rp.startswith(prefix + '.') for rp in readme_paths)
        if p in readme_paths or any(rp.startswith(p + '.') for rp in readme_paths):
            continue
        if prefix_known and last in readme_words:   # README shorthand: j.c.coincident(a, b) .horizontal(a) …
            continue
        if True:
            missing_paths[p].add(f.name[:2])
    for mname in method_re.findall(src):
        if mname not in readme_words and mname not in js_builtins:
            missing_methods[mname].add(f.name[:2])

print('j.* paths not in README:')
for p, fs in sorted(missing_paths.items()):
    print(f'  j.{p:40s} {",".join(sorted(fs))}')
print('\nmethod names not in README:')
for mname, fs in sorted(missing_methods.items(), key=lambda kv: (-len(kv[1]), kv[0])):
    print(f'  .{mname:40s} {",".join(sorted(fs))}')
