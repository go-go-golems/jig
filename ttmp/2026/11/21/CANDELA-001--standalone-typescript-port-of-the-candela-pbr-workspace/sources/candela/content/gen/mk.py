import os, sys, textwrap
OUT = '/home/claude/candela/content/presets'
def P(id, slug, title, group, about, tries, docs, notes, code, focus=None):
    base = f'{id}-{slug}'
    fm = f"---\nid: {id}\ntitle: {title}\ngroup: {group}\nabout: {about}\ntries: {'|'.join(tries)}\ndocs: {', '.join(docs)}\n" + (f"focus: {focus}\n" if focus else '') + "---\n"
    open(os.path.join(OUT, base + '.md'), 'w').write(fm + textwrap.dedent(notes).strip() + '\n')
    open(os.path.join(OUT, base + '.js'), 'w').write(textwrap.dedent(code).strip() + '\n')
