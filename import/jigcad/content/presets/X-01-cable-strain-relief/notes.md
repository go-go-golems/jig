# Cable strain relief

A two-part clamp that grips a 6 mm cable where it leaves a box or runs along a bench, so a tug pulls on the clamp and not on the solder joints. The base screws down with two countersunk M3 screws and carries two captive M3 nuts; the cap closes over the cable with two more M3 screws. The idea it teaches is designing a clamp that clamps: the groove is smaller than the cable and the halves stop short of each other.

> **Try it.** [Look along the cable](lab:view/stage?view=side), then [fit a 4 mm USB cable](lab:param/cable=4) and [squeeze it harder](lab:param/squeeze=1). Both halves follow: they are two bodies of one part. [Select a side of a nut pocket](lab:select/nuts/nut.1[1]).

## Squeeze and gap

Each half is drawn groove up, as it prints, with the cable's axis at `zc = h + gap / 2` above it, so when the cap is turned over onto the base the two axes meet. Each half has a groove of radius `rc = (cable − squeeze) / 2`, 2.7 mm for a 6 mm cable, and the halves stop `gap` = 1 mm apart. So the closed groove is 0.6 mm under the cable across, and tightening the screws squeezes the cable's jacket; if the groove matched the cable, the halves would meet first and the cable would slide.

## How it is built

`half(part, name, x0, width)` adds either half to the part: a rounded block `h` thick centred at `x0`, a groove cut along X with radius `rc − rib`, and three `relief` cuts of the full radius `rc` patterned along it. The base is at x = 0 and the cap at `cap_x`, 8 mm past the base's end. What the relief cuts leave between them are two ribs that stand 0.4 mm into the groove and bite into the jacket.

The base is wider. `nuts` is `j.hole.nutTrap('M3', { from: 'top' })` drilled up from the base's underside: a hex pocket 5.9 mm across the flats (5.5 mm plus the slide gap a side) for a nut pushed in before the base is screwed down. `mount` puts two M3 countersunk holes in the base's wings. The cap has two plain `j.hole.clearance('M3', { fit: 'free' })` holes over the nuts.

## Printing it

One plate, both halves groove up: the grooves are open channels that need no support. The check reports 41.1 mm² of overhang: the ceilings of the two nut pockets, which bridge 6 mm. 8.7 cm³, about 7 g of PETG and 18 min.

## Where next

- [X-02 LED strip channel](lab:preset/X-02): a long profile with a part that slides in.
- [W-02 Vise soft jaws](lab:preset/W-02): one part printed twice, face down.
