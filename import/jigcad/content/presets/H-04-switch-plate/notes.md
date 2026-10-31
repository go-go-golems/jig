# Light-switch cover plate

A cover plate for a wall switch, in three standards: an 86 × 86 mm plate for a 45 × 45 mm Euro-module switch on a UK or EU box, a US single-gang plate for a Decora rocker, and the same US plate for an old toggle. One script draws all three; a config picks the standard. The idea it teaches is configs as a table of standards, with units written as the standard writes them.

> **Try it.** [Look at the back](lab:view/stage?view=plan). Then [deepen it to hide an uneven wall box](lab:param/depth=9), [round the corners more](lab:param/r=12), or [select a countersink](lab:select/screws/csink[1]).

## How it is built

`body` extrudes a rounded rectangle `pw` by `ph` to `depth`, modelled front-down as it prints: z = 0 is the front. `skirt` shells it with the back face open, leaving a 2.4 mm front (`layer(12)`) and a 1.8 mm skirt round the edge that stands the plate off the wall and hides the box. `bevel` chamfers the front edge, `opening` cuts the switch's window through everything, and `screws` drills two countersunk holes at (±`sx`, ±`sy`).

The countersink is `j.hole.countersink(j.expr('screw_d'), j.expr('head_d'), j.expr('sink'))`. Its sizes are params, so they are passed as expressions: a plain string as the first argument would be read as a thread name such as `'M4'`.

## Configs

| config | plate | opening | screws |
|---|---|---|---|
| `eu86` | 86 × 86 mm | 45 × 45 mm Euro module | M3.5, 60.3 mm apart across (BS 4662) |
| `us_decora` | 2.75 × 4.5 in | 1.31 × 2.63 in | #6-32, 3.281 in apart |
| `us_toggle` | 2.75 × 4.5 in | 0.406 × 0.94 in | #6-32, 2.375 in apart |

The US rows are written in inches, `'2.75 in'`, and the expressions convert them: the params view shows 69.85 mm. US flat-head screws have an 82° head, metric ones 90°, so `sink` changes with the row too.

## Printing it

Front-down, so the face that shows is the smooth first layer. The bevel is 0.6 mm across and 1.2 mm up, steeper than 45°. The `eu86` plate is 12,473 mm³, 15 g of PLA and about 41 min; the US plates take about 44 and 55 min. The 90° countersinks of `eu86` open from the bed at exactly 45°: the check reports about 16 mm² of their facets as an overhang, an info and not a problem, since a 45° cone prints cleanly. The 82° US countersinks are steeper and pass.

> **Exercise.** Add a `us_duplex` row for a US outlet: two round openings and one screw between them. Measure an old plate with calipers for the sizes; the second opening needs a second cut in the script and a param for the spacing.

## Where next

[S-07 Furniture leg pads](lab:preset/S-07) uses configs for sizes. [S-08 Wall hook](lab:preset/S-08) countersinks holes that lie across the build.
