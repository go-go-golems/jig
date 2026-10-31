# Pegboard hook

A single hook for 1/4" pegboard: an upper peg that turns up behind the board, a lower peg that props the hook level, and a 50 mm arm with an upturned tip. It is one side profile, extruded 5.2 mm and chamfered along every long edge. The idea it teaches is fitting a square peg to a round hole: what has to pass is the diagonal of the section, not its side.

> **Try it.** [Look at the profile from the front](lab:view/stage?view=front), then [lengthen the arm to 80 mm](lab:param/reach=80) and [fit it to 1/8" board](lab:param/board=3.2). [Select the top of the upper peg](lab:select/body/side[side.p.3]).

## The pegboard

Pegboard has 1/4 in (6.35 mm) holes on 1 in (25.4 mm) centres, in hardboard 1/4 in or 1/8 in thick. The profile is drawn with the face of the board at x = 0, the upper hole at z = 0 and the lower one at z = −`pitch`. The upper peg reaches 0.5 mm past the back of the board (`back`) and turns up by `rise` behind it; the lower peg is a stub 0.5 mm shorter than the board. To hang it, put the upper peg in at an angle and swing the hook down until the lower peg drops into the hole below.

## The peg's section

The hook is `peg` = 5.2 mm wide, and the pegs are 5.2 mm tall in the profile, so their section is a 5.2 mm square, whose diagonal of 7.35 mm will not go into a 6.35 mm hole. `ease` chamfers every long edge by 1.2 mm, which cuts the corners off. The param `diag` measures what is left:

```js
diag: '2 * hypot(peg / 2, peg / 2 - ease)',   // 5.9 mm, under the 6.35 mm hole
```

Raise `peg` and `diag` follows; keep it at least 0.3 mm under the hole.

## Printing it

On its side, `.orient('+Y')`: the profile lies on the bed, so the arm, the tip and the turned-up peg bend within the layers instead of across them, and the 45° chamfers face the bed. 3.6 cm³, about 5 g of PETG and 13 min. PETG bends before it snaps, which suits a hook.

## Where next

- [D-07 Headphone hanger](lab:preset/D-07): a heavier hook on a clamp.
- [W-09 Cordless drill holder](lab:preset/W-09): a wall mount with screws.
