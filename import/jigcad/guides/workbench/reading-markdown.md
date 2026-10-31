# The Markdown the reading views render

Notes, Docs, Reference, the Book and the agent's replies are Markdown rendered by `app/markdown.js`. It is small on purpose; use only what is below. Raw HTML is escaped, and images, footnotes and `<details>` do not exist.

## Elements

| element | write | renders as |
|---|---|---|
| title | `# Title` (once, first line) | `h1`; the next paragraph is the lede |
| section | `## 12.1 Section` | `h2` with an ink rule above; three or more make the contents line |
| subsection | `### …`, `#### …` | `h3`; `h4` small caps in ink-2 |
| emphasis | `**bold**`, `*italic*` or `_italic_` | bold defines a term |
| inline code | `` `rt.step()` `` | code face on a fill chip |
| lists | `- item`, `1. item`, nested by two spaces | |
| tables | GitHub pipe tables; `:--:` and `--:` align | `table.rt.doc-t` in a sideways-scrolling wrapper; write a `\|` inside a cell as `\|` |
| rule | `---` | a hair line |
| inline maths | `$\omega = \dot\theta$` | KaTeX as MathML |
| display maths | `$$` lines around it, ```` ```math ```` (or `tex`, `latex`) | `.mathblock` |
| code | ```` ```js ```` or an unlabelled fence | highlighted with the editor's colours; other languages (`text`, `json`) plain |
| figure | ```` ```svg ```` then a paragraph starting `Figure N.k` (bold allowed) | `figure.fig` with a `figcaption` |
| callout | `> **Try it.** …`, `> **Exercise.** …`, `> **Careful.** …`, `> **Note.** …` | see Callout |
| links | `[text](lab:…)`, `[text](#anchor)`, `[text](https://…)` | lab: links drive the workbench; anchors scroll; web links open a new tab; any other target drops to its text |

Headings get ids from their text (lowercase, non-alphanumerics to hyphens) with a prefix per view: `n-` notes, `d-` docs, `r-` reference, `b-` book. `lab:doc?id=…&at=<slug>` and `lab:book?ch=…&at=<slug>` scroll to a heading by that slug.

A dollar sign that is not maths is written `\$`. A `lab:` link may contain spaces and one level of parentheses: `[open](lab:open?file=a.js&find=.phase('x'))`.

## lab: links

| link | does |
|---|---|
| `lab:preset?id=T-02` | load a preset (its code, notes and stage settings) |
| `lab:book?ch=12&at=slug` | open a chapter (`ch=A` for an appendix), at a heading |
| `lab:doc?id=springs&at=slug` | open a shelf doc (ids in `content/docs/*.md` frontmatter) |
| `lab:open?file=skate/motors.js&find=exports.flick` | open a file at the first line containing the text (or `&line=20`) |
| `lab:trace?id=recognizer/flipTurns` | pin signals or states in Traces (comma-separate several); `lab:pin` is the same |
| `lab:node?id=pop/pop&in=ir` | select a system, signal or state in the Graph (or the IR) |
| `lab:trick?name=kickflip` | play a trick's key gesture |
| `lab:param?id=pop/snap&value=20` | set a parameter; without a value, open it in Params |
| `lab:view?name=side&track=1` | stage camera: `axo`, `front`, `side`, `plan` |
| `lab:overlay?name=forces&on=1` | toggle a stage overlay: shadows, trail, annotations, grid, forces, contacts, rig, sites, course, changes, truth |
| `lab:speed?x=0.25` | time scale |
| `lab:exp?name=…` | open and run an experiment of the loaded preset |
| `lab:show?view=traces` | bring a view forward |
| `lab:order?name=deck plane` | pick a depth-order strategy |
| `lab:record?trick=kickflip` | record a clip (`seconds=`, `replay=0`) and replay it |
| `lab:ask?q=…` | open the agent with a question |
| `lab:reset`, `lab:autopilot?on=1`, `lab:build`, `lab:replay`, `lab:score` | as named |

A link to a parameter, signal or file works only when the loaded preset has it, which is why a Try it loads its preset first. An unknown link shows a red toast ("unknown lab link …").
