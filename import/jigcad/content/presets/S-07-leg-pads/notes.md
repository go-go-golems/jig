# Furniture leg pads

Cups that slip onto the feet of a chair so it stops scratching the floor and scraping when it moves. Each one is a tapered disc with a blind pocket for the leg, and the print job makes four at once. The idea it teaches is configs: S, M and L are named rows of sizes, and switching between them changes several params together.

> **Try it.** [Look at it from the front](lab:view/stage?view=front) to see the taper. Then [fit a 32 mm leg](lab:param/leg=32), [straighten the sides](lab:param/taper=0), and [select the floor of the pocket](lab:select/pocket/floor[1]). Open [the params](lab:show/params) to see which values come from the config.

## How it is built

`body` extrudes a circle `base_d` across by `h` with a taper of −12°: a positive taper flares outward as it rises, so the sign is negative and the cup narrows to `leg + 2 * wall` at the rim. `base_d` is written from the taper, `leg + 2 * wall + 2 * h * tan(taper)`, so the rim keeps its 2.25 mm wall whatever the angle.

`pocket` is a blind hole from the top, `j.hole.simple(j.fit.hole('leg', 'snug'), 'depth')`. The snug class makes it a little larger than the leg, enough to push on by hand and stay on when the chair is lifted. `rim` rounds both edges of the top, so the pocket's mouth is a lead-in; `foot` chamfers the bed edge.

## Configs

`.configs({ S, M, L })` holds three rows: S is a 20 mm stool leg 6 mm deep, M a 28 mm dining-chair leg, L a 40 mm table leg with a 10 mm pocket and a sixth line in the wall. `.config('M')` picks the active row; a param that a row does not mention keeps its default. A value you set by hand overrides the config, and the [params view](lab:show/params) shows where each value came from.

## Printing it

Open side up, four to a plate: 4,344 mm³ each, 18 g of TPU 95A for the set and about 49 min. TPU is soft, so it grips the floor and does not mark it; print it slowly (20–30 mm/s) with retraction low. In PETG the pads are harder and slide, which suits a chair you move a lot.

> **Exercise.** Measure your own chair's feet and add a fourth config, `mine`, with `leg` and `depth`. Switch to it with `.config('mine')`.

## Where next

[S-05 Bag clip](lab:preset/S-05) uses a fit class for a sliding part. [H-01 Plant pot](lab:preset/H-01) puts two different parts on one plate.
