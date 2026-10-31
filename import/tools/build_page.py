"""Build one self-contained HTML page from jig's README.md and examples/*.js.

Usage: python3 build_page.py <jig dir> <out.html>
"""
import re, sys, html, pathlib
import markdown
from pygments import highlight
from pygments.lexers import JavascriptLexer
from pygments.formatters import HtmlFormatter

root = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])

readme_src = (root / 'README.md').read_text()
md = markdown.Markdown(extensions=['tables', 'fenced_code', 'codehilite', 'toc'],
                       extension_configs={'codehilite': {'css_class': 'codehilite', 'guess_lang': False},
                                          'toc': {'toc_depth': '2-3'}})
readme_html = md.convert(readme_src)
toc_tokens = md.toc_tokens

# Wrap tables so only they scroll sideways on a phone.
readme_html = readme_html.replace('<table>', '<div class="table-wrap"><table>').replace('</table>', '</table></div>')
# Drop the top-level title and the hand-written contents line: the page has its own masthead and nav.
readme_html = re.sub(r'<h1 id="jig">jig</h1>\s*', '', readme_html, count=1)
readme_html = re.sub(r'<p>Contents:.*?</p>\s*', '', readme_html, count=1, flags=re.S)
readme_html = re.sub(r'^\s*<p><strong>A composable grammar.*?</p>\s*<blockquote>.*?</blockquote>\s*', '', readme_html, count=1, flags=re.S)

SECTIONS = [  # (letter, title, lo, hi) from the README example map
    ('A', 'Foundations and the maths of shape', 1, 13),
    ('B', 'Joining, products, fit', 14, 17),
    ('C', 'Print output and the compiler', 18, 21),
    ('D', 'Real-world scenarios', 30, 39),
    ('E', 'Design process', 40, 49),
    ('F', 'Scientific study', 50, 59),
    ('G', 'Meta-design and capstone', 60, 99),
]

fmt = HtmlFormatter(cssclass='codehilite')
lexer = JavascriptLexer()
examples = []
for f in sorted((root / 'examples').glob('*.js')):
    src = f.read_text()
    first = src.splitlines()[0]
    m = re.match(r'//\s*(\d+)\s*·\s*(.*)', first)
    num, title = (int(m.group(1)), m.group(2).strip()) if m else (0, f.stem)
    examples.append({'num': num, 'title': title, 'file': f.name, 'lines': src.count('\n') + 1,
                     'code': highlight(src, lexer, fmt)})

def section_of(n):
    for s in SECTIONS:
        if s[2] <= n <= s[3]:
            return s
    return SECTIONS[-1]

# ── navigation ──
nav = ['<p class="nav-head">Specification</p><ol class="nav-list">']
for t in toc_tokens:
    nav.append(f'<li><a href="#{t["id"]}">{html.escape(t["name"])}</a></li>')
nav.append('</ol>')
for letter, stitle, lo, hi in SECTIONS:
    items = [e for e in examples if lo <= e['num'] <= hi]
    if not items:
        continue
    nav.append(f'<p class="nav-head"><span class="sec">{letter}</span> {html.escape(stitle)}</p><ol class="nav-list ex">')
    for e in items:
        short = e['title'].split(':')[0]
        nav.append(f'<li><a href="#ex-{e["num"]:02d}"><span class="num">{e["num"]:02d}</span> {html.escape(short)}</a></li>')
    nav.append('</ol>')

# ── example sections ──
ex_html = ['<h2 id="examples">Examples</h2>',
           '<p class="lede">Every file parses as an ES module. Results in <code>// →</code> comments show the shape of a result; there is no kernel yet.</p>']
for letter, stitle, lo, hi in SECTIONS:
    items = [e for e in examples if lo <= e['num'] <= hi]
    if not items:
        continue
    ex_html.append(f'<h3 class="ex-section" id="sec-{letter.lower()}"><span class="sec">{letter}</span> {html.escape(stitle)}</h3>')
    for e in items:
        ex_html.append(
            f'<section class="example" id="ex-{e["num"]:02d}">'
            f'<div class="ex-head"><h4><span class="num">{e["num"]:02d}</span> {html.escape(e["title"])}</h4>'
            f'<span class="file">{html.escape(e["file"])} · {e["lines"]} lines</span></div>'
            f'{e["code"]}</section>')

n_modules = len(re.findall(r'^\| \d+ \| `', readme_src, flags=re.M))
n_sorts = len(re.findall(r'^\| \*\*[A-Z]', readme_src.split('## 3. Core grammar')[1].split('## 4.')[0], flags=re.M))
n_levels = len(re.findall(r'^\| \*\*L\d\*\* \|', readme_src, flags=re.M))

light_css = HtmlFormatter(style='default').get_style_defs('.codehilite')
dark_css = HtmlFormatter(style='github-dark').get_style_defs(
    [':root[data-theme="dark"] .codehilite'])
dark_css_media = HtmlFormatter(style='github-dark').get_style_defs(
    [':root:not([data-theme="light"]) .codehilite'])

page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>jig print grammar</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
/* Layout idea: a spec sheet on a build plate. Sticky contents rail beside one reading column; code and tables scroll on their own. */
:root {{
  --bg: #f3f4f1; --surface: #ffffff; --ink: #1c221f; --muted: #5b655e; --rule: #d6dbd3;
  --accent: #c94a0c; --accent-soft: #fbe9df; --code-bg: #fafaf8;
  --display: "IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color-scheme: light;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --bg: #0f1311; --surface: #151a17; --ink: #e4e9e5; --muted: #98a39b; --rule: #29302b;
    --accent: #ff8b4d; --accent-soft: #2b1a10; --code-bg: #111613; color-scheme: dark;
  }}
}}
:root[data-theme="dark"] {{
  --bg: #0f1311; --surface: #151a17; --ink: #e4e9e5; --muted: #98a39b; --rule: #29302b;
  --accent: #ff8b4d; --accent-soft: #2b1a10; --code-bg: #111613; color-scheme: dark;
}}
* {{ box-sizing: border-box; }}
html {{ scroll-padding-top: 16px; }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 var(--body); -webkit-text-size-adjust: 100%; }}
a {{ color: var(--accent); text-underline-offset: 2px; }}
a:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }}
code, pre {{ font-family: var(--mono); }}
:not(pre) > code {{ font-size: 0.88em; background: var(--accent-soft); padding: 0.05em 0.3em; border-radius: 3px; }}

.masthead {{ border-bottom: 1px solid var(--rule); background:
    repeating-linear-gradient(to bottom, transparent 0 5px, color-mix(in srgb, var(--rule) 55%, transparent) 5px 6px), var(--surface); }}
.masthead-inner {{ max-width: 1240px; margin: 0 auto; padding: 28px 20px 22px; display: grid; gap: 10px; }}
.masthead h1 {{ margin: 0; font: 600 clamp(2.2rem, 6vw, 3.2rem)/1 var(--display); letter-spacing: -0.01em; }}
.masthead h1 span {{ color: var(--accent); }}
.masthead p {{ margin: 0; max-width: 62ch; color: var(--muted); }}
.masthead .motto {{ font-style: italic; color: var(--ink); }}
.stats {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; padding: 0; list-style: none; }}
.stats li {{ font: 500 0.8rem/1 var(--mono); padding: 6px 9px; border: 1px solid var(--rule); border-radius: 4px; background: var(--surface); font-variant-numeric: tabular-nums; }}
.stats b {{ color: var(--accent); font-weight: 500; }}

.layout {{ max-width: 1240px; margin: 0 auto; padding: 0 20px; display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 40px; }}
.toc {{ position: sticky; top: 0; align-self: start; max-height: 100vh; overflow-y: auto; padding: 20px 0 40px; font-size: 0.85rem; }}
.toc summary {{ display: none; }}
.nav-head {{ margin: 18px 0 6px; font: 600 0.78rem/1.3 var(--display); text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }}
.nav-list {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }}
.nav-list a {{ display: block; padding: 3px 8px; border-radius: 4px; color: var(--ink); text-decoration: none; }}
.nav-list a:hover {{ background: var(--accent-soft); }}
.num {{ font: 500 0.8em var(--mono); color: var(--accent); font-variant-numeric: tabular-nums; }}
.sec {{ display: inline-grid; place-items: center; width: 1.4em; height: 1.4em; border-radius: 3px; background: var(--accent); color: var(--surface); font: 600 0.8em/1 var(--mono); }}

main {{ min-width: 0; padding: 12px 0 80px; }}
main > article > p, main > article > ul, main > article > ol, main > article > blockquote, .lede {{ max-width: 70ch; }}
h2, h3, h4 {{ font-family: var(--display); text-wrap: balance; line-height: 1.2; }}
h2 {{ font-size: 1.75rem; font-weight: 600; margin: 56px 0 14px; padding-top: 14px; border-top: 2px solid var(--ink); }}
h3 {{ font-size: 1.2rem; font-weight: 600; margin: 32px 0 10px; }}
blockquote {{ margin: 16px 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--accent); color: var(--muted); font-style: italic; }}
.table-wrap {{ overflow-x: auto; margin: 14px 0 22px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); }}
table {{ border-collapse: collapse; width: 100%; font-size: 0.86rem; line-height: 1.45; }}
th, td {{ text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid var(--rule); }}
th {{ font-family: var(--display); font-weight: 600; background: var(--bg); position: sticky; top: 0; }}
tr:last-child td {{ border-bottom: 0; }}
td code {{ white-space: nowrap; }}

.codehilite {{ background: var(--code-bg) !important; border: 1px solid var(--rule); border-radius: 6px; overflow-x: auto; margin: 12px 0 20px; }}
.codehilite pre {{ margin: 0; padding: 14px 16px; font-size: 0.8rem; line-height: 1.55; tab-size: 2; }}
.ex-section {{ margin-top: 44px; font-size: 1.3rem; display: flex; gap: 10px; align-items: center; }}
.example {{ margin: 22px 0 34px; }}
.ex-head {{ display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; }}
.ex-head h4 {{ margin: 0; font-size: 1.05rem; font-weight: 600; }}
.file {{ font: 0.75rem var(--mono); color: var(--muted); }}

@media (max-width: 900px) {{
  .layout {{ grid-template-columns: minmax(0, 1fr); gap: 0; }}
  .toc {{ position: static; max-height: none; padding: 12px 0 0; }}
  .toc summary {{ display: list-item; cursor: pointer; font: 600 0.95rem var(--display); padding: 10px 12px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); }}
  .toc[open] summary {{ margin-bottom: 4px; }}
  h2 {{ font-size: 1.45rem; margin-top: 44px; }}
  .codehilite pre {{ font-size: 0.74rem; padding: 12px; }}
  table {{ min-width: 680px; }}
}}
@media (prefers-reduced-motion: no-preference) {{ html {{ scroll-behavior: smooth; }} }}
{light_css}
@media (prefers-color-scheme: dark) {{
{dark_css_media}
}}
{dark_css}
.codehilite, .codehilite pre {{ background: var(--code-bg) !important; }}
</style>
</head>
<body>
<header class="masthead"><div class="masthead-inner">
  <h1>jig<span>.</span></h1>
  <p class="motto">A jig holds the work and guides the tool.</p>
  <p>A composable grammar for modelling 3D-printable objects. Immutable builders over a small mathematical core, opinionated print-first defaults, lambdas in every slot, and seven inspectable IR levels from source to sliced plate. This is an API design sketch, written as a specification and example files.</p>
  <ul class="stats">
    <li><b>{n_modules}</b> modules</li><li><b>{n_sorts}</b> core sorts</li><li><b>{n_levels}</b> IR levels</li><li><b>{len(examples)}</b> examples</li>
  </ul>
</div></header>
<div class="layout">
  <details class="toc" id="toc" open><summary>Contents</summary><nav aria-label="Contents">{''.join(nav)}</nav></details>
  <main>
    <article>{readme_html}</article>
    {''.join(ex_html)}
  </main>
</div>
<script>
(function () {{
  var toc = document.getElementById('toc');
  var narrow = window.matchMedia('(max-width: 900px)');
  function sync() {{ if (narrow.matches) toc.removeAttribute('open'); else toc.setAttribute('open', ''); }}
  sync();
  if (narrow.addEventListener) narrow.addEventListener('change', sync);
  toc.addEventListener('click', function (e) {{ if (narrow.matches && e.target.closest('a')) toc.removeAttribute('open'); }});
}})();
</script>
</body>
</html>
'''
out.write_text(page)
print(f'wrote {out} · {len(page)/1024:.0f} KiB · {len(examples)} examples · modules {n_modules} sorts {n_sorts} levels {n_levels}')
