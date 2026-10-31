# Kitchen funnel

A 100 mm funnel for filling bottles and jars: oil into a cruet, rice into a jar, lentils into a narrow-necked bottle. It is a revolved cone and spout, hollowed by a shell that is open at both ends, with a flat flange and a hanging tab at the rim and three air ribs down the spout. The idea it teaches is a shell with two open faces, and printing a shape the way up that makes it easy.

> **Try it.** [Look at it from the front](lab:view/stage?view=front): it is modelled mouth-down, as it prints. Then [make a jam funnel with a wide spout](lab:param/spout_d=40), [lengthen the spout](lab:param/spout_l=60), or [select the inside of the cone](lab:select/hollow/inner[body/side[section.p.2]]).

## How it is built

`section` is a solid half-section: the mouth on the bed, up the cone to the spout, up the spout, back along the axis. `body` revolves it into a solid cone with a cylinder on top. `hollow` shells it with two open faces, `sideFace('p.1').or(sideFace('p.4'))`: the mouth and the spout's end, each named by the profile segment that swept it. The wall is `lw(4)`, 1.8 mm.

`flange` is a ring 5 mm wide and 1.6 mm thick round the mouth, and `tab` a slot-shaped tab with a 6 mm hole; they are two extrudes, each joining the funnel because it touches it. `ribs` is one 1.2 mm strip patterned three times round Z in a sketch 2 mm below the top of the cone, extruded up the spout: when the spout sits in a bottle neck, air escapes past the ribs instead of bubbling back through the liquid.

## Printing it

Mouth-down on the bed. The cone narrows as it rises, so its outside leans in and its inside leans 36° from vertical, inside the 45° limit; the ribs start inside the cone's wall, so none begins in mid-air. The flange turns the first layer into a 5 mm ring instead of a 1.8 mm one, which holds the tall part down. It is 28,707 mm³, 36 g of PETG and about 2 h. PETG takes hot washing-up water better than PLA. For food, choose a filament sold as food-contact and wash it well: layer lines hold residue.

> **Exercise.** The `L` config makes a 140 mm funnel. Check its cone angle from `top_d`, `spout_d` and `cone_h`, and keep it under 45° from vertical if you change them.

## Where next

[H-01 Plant pot](lab:preset/H-01) shells a revolve with one open face. [H-09 Measuring scoop](lab:preset/H-09) sizes a revolved bowl by its volume.
