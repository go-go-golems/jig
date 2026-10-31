# Plant pot and saucer

A 115 mm plant pot with four drainage holes, and a saucer with six ribs on its floor for the pot to stand on, so water drains out and the roots never sit in it. They are two parts printed side by side on one plate. The idea it teaches is a pair of parts built from one set of params: the saucer's floor is written from the pot's base, so they always fit each other.

> **Try it.** [Look at it from the front](lab:view/stage?view=front): the pot is modelled standing in the saucer. Then [make the pot taller](lab:param/pot.h=130), [deepen the saucer](lab:param/saucer.sh=20), or [select a drainage hole](lab:select/drain/bore[1]). In [the params](lab:show/params) each part keeps its own copy of `P`, so [`pot.base_d`](lab:param/pot.base_d=95) widens the pot alone; change `base_d` in `P` and press [Run](lab:run) to widen both.

## How it is built

Both parts read the same object `P`, the same `sizes` configs and the same exposed labels. The pot is a four-point half-section, a frustum from `base_d` to `top_d`, revolved a full turn and hollowed by `shell` with the top face open: `j.feat('body').sideFace('p.3')`, the face that segment 3 of the section swept. The wall is `lw(4)`, 1.8 mm, four whole lines, which a slicer lays without gaps.

`drain` drills one hole in the middle and three on a ring of radius `0.3 * base_d`, at 90°, 210° and 330°, from 3D points on the inside floor. The saucer's ribs run at every 60° from 0°, so the three outer holes fall between them and none is blocked.

The saucer's floor is `sd = base_d + 2 * margin`, and its sides rise at `flare`, 30° from vertical. `ribs` is one 1.8 mm strip, patterned six times round Z in the sketch and extruded 3 mm up from the floor: the pot stands on the ribs and the water runs between them.

## Printing it

Both upright. The pot's side leans out 8.5°, the saucer's 30°: both inside 45°. The bed edges have asymmetric chamfers, steeper than 45° along the flared sides, so even they need no support. The pair is 89,499 mm³, 114 g of PETG and about 5 h 10 min. PETG rather than PLA, because the pot lives with wet soil and sun.

## Changing it

`S` (90 mm) and `L` (150 mm) are configs beside the default `M`. S fits a windowsill herb; L is a houseplant pot, and its pair is too wide for a 250 mm bed side by side, so the job puts it on two plates and says so in the header.

> **Exercise.** Add a fourth config for a 70 mm cactus pot with `drain_d` of 4 mm, then check the plate count stays at 1.

## Where next

[H-02 Soap dish](lab:preset/H-02) drains water through slots instead of holes. [H-06 Egg cup](lab:preset/H-06) is a smaller revolve with a shell.
