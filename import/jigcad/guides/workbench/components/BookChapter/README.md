# BookChapter

One chapter of the book in the workbench: a toolbar with its label, title, previous and next, and Export; a red chapter label over the title; the text at 14px; the presets and docs it pairs with; and links to the neighbouring chapters.

## Use

`.bmain` beside BookContents in `.bookview`:

1. **Toolbar**: Contents (only in a narrow tile), `.ntitle` with "Chapter 47" in `.pcode` and the title in bold, a spacer, ‹ › IconButtons (their `title` is the neighbour's label and title), and Export ▾ (see Menu).
2. **Part opener** (`.bpartopen`), only before the first chapter of a part: "PART VII" small caps in ink-2, the part title at 22px under a 3px ink rule, its about in ink-2 over a 1 px ink rule.
3. **Chapter label** (`.bchlabel`): "CHAPTER 47" in accent, 10.5px bold, letter-spaced 0.14em; " · not written yet" in ink-2 for a draft.
4. **The chapter** as a Doc at book size (74ch, 14px/1.68, h1 26px, h2 17px).
5. **RelatedList** (`.bpairs`): In the workbench, On the shelf.
6. **Previous and next** (`.bnav`): two hair-bordered buttons, small label ("‹ Chapter 46", "Chapter 48 ›") over the title in bold.

## Markup

```html
<div class="doc bchlabel"><span>Chapter 47</span></div>
<article class="doc">…</article>
<div class="doc bnav"><button><small>‹ Chapter 46</small><b>Shadows and hatching</b></button><button class="nx"><small>Chapter 48 ›</small><b>Drawing forces</b></button></div>
```

How to write the chapter itself is in the section *Writing a book section*.

## Known issue

`.bookview .bchlabel` sets its own 10.5px font, so its `max-width: 74ch` is 74 of its own small characters (about 430px) while the chapter's box is 74ch at 14px (about 575px). In a tile wider than the label's box the two boxes centre differently and the label sits right of the title: 19px in the "Reading the book" layout at 1440px, 72px at 2200px. Give the label the chapter's measure (for example, keep the `.doc` font size on the box and set the small type on its inner `span`) when you build from this.
