# Snap-fit battery cover

A box for two AA cells and a lid that clicks onto it. Two hooks hang from the lid, bend as it goes on, and spring out into windows in the side walls. The idea it teaches: a snap fit is a beam, and a beam has a strain limit. `j.lib.snap.cantilever` computes the strain as it compiles and stops the compile with `print.snapStrain` if the beam would crack.

> **Try it.** [Select the ramp of the right-hand hook](lab:select/hookR/ramp), the face that pushes the beam aside as the lid goes on, then [its flat retaining face](lab:select/hookR/retention). [Open the trace](lab:show/trace) and read the hook's note: strain 58 % of allowable. Then [raise the divider to 8 mm](lab:param/rib=8).

## The hooks

Each hook is a 12 mm beam, 1.4 mm thick and 8 mm wide, with a barb that stands 1.0 mm proud: a 30° ramp, a 0.3 mm land and a square retaining face. Bending the tip 1.0 mm strains the root by ε = 1.5 · t · y / L² = 1.5 × 1.4 × 1.0 / 144 = 1.46 %. PETG takes 2.5 %, so the hook works at 58 % of its limit and survives being opened again and again. The feature reports 6.7 N to deflect the beam and about 7.1 N to push the lid on.

Make the beam 8 mm long and the strain rises to 3.3 %; the compile fails with `print.snapStrain` and suggests a longer or thinner beam. The beams hang 0.2 mm off the side walls, so each barb goes 0.8 mm into its window.

## The box

The bay is 34 × 56 × 15.5 mm: two Ø14.5 mm cells side by side with room for a hook at each side, and 50.5 mm of cell plus a spring and a flat contact (about 5 mm) along it. A 1.2 mm divider keeps the cells apart. The windows are one sketch rectangle on the YZ plane cut `{ symmetric: … }`, through both side walls at once. Each window runs from below the beam's tip to 0.2 mm above the barb's retaining face, so the closed lid can lift 0.2 mm and no more. An assembly of the two parts with the lid turned over confirms it: at 0.05 mm above the box nothing touches, at 0.3 mm the barbs catch.

To open the box, press both barbs in through the windows with a fingernail or a pen and lift.

## Printing it

Both parts flat, the lid outer face down so the hooks print as upright prisms: about 17 g of PETG and 48 min. The window tops are short bridges and the barbs' retaining faces small overhangs; the job reports 16.0 mm² as info and both print without support. Do not print the lid in PLA: at 2 % allowable strain its hooks would work at 73 % of the limit and crack within a few dozen openings.

## Where next

- [D-04 Battery holder](lab:preset/D-04): cells standing in a block.
- [M-05 Living-hinge box](lab:preset/M-05): a lid that is part of the box.
