# RelatedList

The lists under a document that tie it to the rest of the workbench: In the workbench, On the shelf, In the book, Presets that use this, Further reading on the shelf.

## Use

`div.doc.related` after the document (in the Book, `.bpairs`). Each list has an `h4` header (12px bold uppercase ink-2, a hair rule above) and items made of a lab: link with the thing's code and title, then " — " and its about in `.dim`. Notes list their shelf docs and the chapters that pair with the preset; docs list chapters and presets; chapters list their presets and docs (from `book.json`).

## Markup

```html
<div class="doc related bpairs">
  <h4>In the workbench</h4>
  <ul><li><a href="#" class="lablink">D-03 Onion skins and chronophotographs</a> <span class="dim">— Drawing motion in a still image: …</span></li></ul>
</div>
```

## Do and don't

- Do take the titles and abouts from the presets', docs' and chapters' own frontmatter or plan.
- Don't list a chapter that is still a draft.
