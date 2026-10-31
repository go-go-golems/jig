# Inspector

The side column of the Graph and IR views: what the selected node is, where it is declared, what it reads and writes, and its live values.

## Use

`aside.side` with Blocks, in this order:

1. **The id** as the title, its kind and phase in `.sub` ("system · controls"), the system's own `describe` text as a `.note`, and its source as `.link.strong` ("skate/motors.js:153") with a second link to its tick ("tick at 159").
2. **Reads** and **Writes**, each with its count in `.sub` and its references as `.nid` buttons in `.refs` (code face). Additive writes say "(additive)". A reference that is not a node of the program is `.nid.dim`.
3. **Expression** for a signal, as `code.exprtxt`.
4. **Live**: "t = 3.77 s" in `.sub`, then a KeyValue list (value, ms / step, calls, local.*) with three decimals.
5. **Range** for a param: default, min · max, unit, and "open in Params".

With nothing selected the block says how to select something.

## Markup

See Block, KeyValue, TextLink. The ids are buttons so the keyboard reaches them.

## Do and don't

- Do put the links to the source first; reading the code is the next step.
- Do separate adjacent action links with a space or a gap (the inspector's source links currently touch).
