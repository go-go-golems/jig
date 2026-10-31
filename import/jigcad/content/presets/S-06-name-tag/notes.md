# Keyring name tag

A tag for a key ring, a school bag or a dog lead, with a name standing 0.8 mm proud of a 3 mm plate. It is one sketch, one extrude and one emboss, and the idea it teaches is text: the name is real outlines from a font, raised from a face of the part, and the tag's length is written from the name.

> **Try it.** [Look down on it](lab:view/stage?view=plan). Then [make the letters bigger](lab:param/size=10) and watch the tag grow with them, [select the ring hole](lab:select/plate/side[outline.ring]), or change `NAME` at the top of the script and press [Run](lab:run).

## How it is built

`outline` is a rounded rectangle `w` by `h` with a circle inside it, so `plate` comes out of one extrude with its 5 mm ring hole already in it. `letters` embosses `j.region.text(NAME, …)` onto `j.feat('plate').endFace()` by `relief`, `layer(4)`: four 0.2 mm layers. `size` is the cap height, 8 mm, and the text is left-aligned just past the ring end.

The width is an expression the script writes from the name: `` `${NAME.length} * size + h + 4 mm` ``, which for MAREN is `5 * size + h + 4 mm`, 62 mm. A capital in this font is at most about as wide as it is tall, so the name always fits, and because `size` and `h` stay symbolic, a change to `size` still lengthens the tag. The name is a JavaScript constant rather than a param: params hold numbers and sizes, and the text is something you type once.

## Printing it

Flat on the bed with the letters up. It is 3,281 mm³, 3 g of PLA and about 9 min. The plate is 15 layers, enough not to snap on a key ring; the letters are four layers, enough to feel.

For a two-colour tag on a single-nozzle printer, add a filament change (a pause, `M600`) at the first layer above 3.0 mm in the slicer. The plate prints in the first colour and the name in the second.

> **Exercise.** Add a 1 mm raised border round the edge at the same height as the letters: emboss a second region, `j.region.rect('w', 'h', { r: 'h / 2 - 1 mm' })` minus a smaller one, so the letters are protected in a pocket.

## Where next

[S-04 Plant label](lab:preset/S-04) is the tag's cousin for the garden, written by hand. [H-04 Light-switch plate](lab:preset/H-04) puts a different outline into one script with configs.
