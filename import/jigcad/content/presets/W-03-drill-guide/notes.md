# Drill guide

A block that holds a hand drill square to the work: six bores for 3, 4, 5, 6, 8 and 10 mm drills, each with its size engraved in front of it, and a V-groove underneath that centres the guide on a dowel or a pipe. The idea it teaches is sizing holes by a fit class from a table: each row of `drills.csv` becomes one hole feature, and the class decides how much bigger than the drill the bore is.

> **Try it.** [Select the 6 mm bore](lab:select/bore-6/bore[1]), then [make the block 40 mm tall](lab:param/H=40) for a longer guide. [Turn the V-groove off](lab:param/vee=0) for flat work, and [look from the side](lab:view/stage?view=side) to see it.

## The table and the bores

`drills.csv` has a label and a diameter per drill. The block's length is an expression written from the table, every drill plus a 7 mm web between and outside them: 85 mm for the six drills here. `xOf(k)` writes the expression for the centre of bore k in the same way.

Each row becomes `bore-<label>`, a countersunk through hole at a 3D point on the top face:

```js
j.hole.countersink(j.fit.hole(mm(r.d), 'snug'), mm(r.d + 2), deg(90), 'through')
```

`j.fit.hole(d, 'snug')` is the drill plus 0.1 mm a side plus 0.1 mm of hole compensation, so the 6 mm bore is modelled at 6.3 mm: printed holes come out a little small, and a drill should turn freely without wobble. The 1 mm lead-in at the top guides the drill's point in. The point is a 3D `j.pt(x, 0, 'H')` rather than a 2D `[x, 0]`, because only 3D points take expressions.

## The groove and the sizes

`groove` is a 90° V 8 mm deep, cut along the whole block: round stock up to 22 mm across sits in it centred under the bores. `size-<label>` engraves each size 0.6 mm deep, one region per drill; a text region given `at` lands where it says on the face.

## Printing it

Upright: every bore is vertical, so it prints round and on size, and the V's sides face the bed at 45°. `foot` chamfers the bed edges but leaves the groove's edges alone, since a chamfer there would be flatter than 45°. 70.8 cm³ solid, about 32 g of PETG and 89 min; three or four perimeters give each bore a solid wall.

## Where next

- [D-06 Memory-card holder](lab:preset/D-06): a block laid out from a table.
- [W-08 Spacer and standoff set](lab:preset/W-08): a table that makes many parts.
