# Layouts and the dock

The workbench is one window: the header bar, then a dock of tiles. A tile shows one view at a time behind a strip of tabs; tiles sit side by side or stacked in nested splits. Everything about the arrangement belongs to the person using it and is kept in their browser (`localStorage`, key `formskate.v1.layout`).

## The layout tree

A layout is a small tree (`app/ui/dock.jsx`): a **tile** `{ t: 'tile', views: [...], active }` or a **split** `{ t: 'split', dir: 'row' | 'col', kids: [...], sizes: [...] }` whose sizes are fractions that sum to 1. Unknown or duplicate views, empty tiles and one-child splits are removed when a layout loads; splits in the same direction merge.

## The seven layouts

| layout | arrangement |
|---|---|
| Code beside the stage (default) | left 36%: Notes, Code, Agent, Docs, Book, Reference; right: Stage over Traces, Events, Params, Graph, IR, Experiments (68 / 32) |
| Stage first | left 64%: Stage over Traces, Events, Params; right: everything else |
| The program: code, graph, IR | three columns: Code and the reading views; Graph and IR; Stage over the panels |
| Reading the notes | left 46%: Notes, Docs, Book, Reference; right: Stage over the rest |
| Experiments and traces | left: Code and reading; right: Experiments and Params over Traces, Events, Stage, Graph, IR |
| Reading the book | half and half: Book, Notes, Docs, Reference; Stage over the rest |
| Everything in one tile | all thirteen views as tabs, Stage in front |

On a phone (under 640px) the dock is always one tile with Stage first.

## Moving things

- **Click a tab** to show it; **drag it** onto another tile's tabs to move it there, onto the edge of a tile (the outer 22%) to split that tile on that side, or into its middle to add it as a tab. The drag shows where it will land (see DragFeedback).
- **Drag a gutter** to resize; each side keeps at least 6%.
- **×** closes a view (it goes to the + menu and the empty-tile picker); **+** opens a closed view in this tile.
- **Links bring views forward.** A lab: link or an action that needs a view (`host.focus({ view })`) activates it in its tile, or adds it next to related views (Code near Notes and Agent, Traces near Events and Params…) if it was closed.

## Designing a view for the dock

- A view must work from about 320px to the full window in either direction. Use the `tile` container query (`@container tile (max-width: 640px)`) rather than media queries: the tile is what changes size.
- At narrow widths stack the side column under the body (the shared rules do this for `.tabbody` and `.page`) and fold left-hand columns away behind a button (the Book's Contents).
- Never assume a view is visible: it may be behind another tab. Do expensive drawing only while mounted.
- Keep a view's own state (open file, chapter, scroll position) in the view or in `store` (`formskate.v1.*`), so closing and reopening a tab brings it back.
