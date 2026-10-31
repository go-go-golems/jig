# About this export

This folder is a complete copy of the **Form Skate Workbench** design system, exported on 2026-10-29 from https://claude.ai/artifact/5aW5wCqpBBTFm6rtezFLaG (version 1793208608-1cf1).

Open `index.html` in a browser to read it offline: the brand book, every section, the tokens in both themes, each component's live preview beside its guidelines, and the screenshots. The theme button cycles system, light and dark.

## What is here

| path | what |
|---|---|
| `README.md` | the brand book: start here |
| `*.md` | further sections |
| `tokens.json` | the tokens (colours in 2 themes, type, spacing and other families) |
| `tokens.css` | the same tokens as CSS custom properties, compiled the way the design system page compiles them: `:root, [data-theme="light"]` then `[data-theme="…"]` per further theme, one class per text style |
| `components/bundle.css` | the components' stylesheet; it expects `tokens.css` before it |
| `components/<Name>/README.md` | the component's guidelines |
| `components/<Name>/preview.html` | its preview exactly as published (it relies on the page preloading tokens.css, bundle.css) |
| `components/<Name>/standalone.html` | the same preview with those files linked, so it opens on its own; add `#light` or `#dark` to the address to pick a theme |
| `assets/` | 5 screenshots of the real app, with a README per group |
| `design-system.json` | the system's index (title, namespace, asset records; the `blob` ids refer to the online copy) |
| `index.html` | the offline browser |

## Using it elsewhere

Load `tokens.css`, then `components/bundle.css`, and set `data-theme="light"` or `data-theme="dark"` on the root element. Use the class names and markup each component's README gives.

The files under `components/` and the Markdown are unchanged from the published system. `tokens.css`, the `standalone.html` files, `index.html`, `fonts/` and this file were added by the export.
