# Doc

The reading surface for Notes, Docs and Reference: Markdown rendered by `app/markdown.js` into `article.doc`, 13.5px Arial at line height 1.65, at most 76 characters wide.

## Use

- **Title** (`h1`, 22px bold) and **lede** (the first paragraph, 13px ink-2).
- **Contents line** (`nav.toc`): added under the lede when the document has three or more `##` sections; the section titles in ink-2, linked to their anchors.
- **Sections** (`h2`, 16px bold) open with a 1 px ink rule above and 30px of space: the rule is the section break. `h3` 13.5px; `h4` small caps in ink-2 for list headers.
- **Body**: paragraphs 10px apart, lists indented 22px, `**bold**` defines a term, `code` on a fill chip at 0.9em.
- **Links**: ordinary links are ink with a hair underline. A **lab: link** (`a.lablink`, from `[text](lab:…)`) drives the workbench: red underline 1.5px and a red ▸ after it. In exports it becomes dotted plain text.
- **Tables** (`table.rt.doc-t` in `.tablewrap-x`): 12.5px, left-aligned, header ink-2.
- **Maths**: KaTeX rendered as MathML, inline at 1.08em, display blocks (`.mathblock`) at 1.12em.
- **Code**: see CodeBlock; figures: see Figure; callouts: see Callout.

## Markup

```html
<article class="doc">
  <h1 id="d-a-tour-of-the-workbench">A tour of the workbench</h1>
  <p>Form Skate Workbench is an IDE for one program…</p>
  <nav class="toc"><a href="#" data-anchor="d-the-loop">The loop</a>…</nav>
  <h2 id="d-the-loop">The loop</h2>
</article>
```

The Markdown a reading view accepts is in the section *The Markdown the reading views render*.

## Do and don't

- Do let the measure stay narrow (76ch); a wide tile gets white space, not longer lines.
- Don't style headings with colour or underline; the ink rule above h2 is the only ornament.
