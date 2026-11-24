# Speeds escapement

Follow the load from the main cam into the retard lever. Its kicker throws the inertia weight and, at the settings where the first segment is within reach, drives the segment. These three parts share a post and can rotate independently. The segment drives the compound wheels and then the star. At slow settings the blade ring releases the pallet control lever, allowing the pallet to engage the star. The speed cam determines the available segment stroke and whether the pallet can engage.

| Setting | Evidence from repair course Lesson 9, Figs. 31–37 |
| --- | --- |
| 1 s through 1/15 | Pallet engaged during the exposure. The available segment stroke decreases toward 1/15. |
| 1/30 | Pallet held out, segment returns to full stroke. |
| 1/250 | Segment held clear, inertia weight alone receives the kick. |
| 1/500 | Speed cam holds the retard lever clear of the main drive cam. |

Figures 58 and 60–62 identify the two retaining screws, independently swinging segment and weight, and the control-lever tab. These photographs show the size 00 sibling. The Compur factory manual, May 1956 plate 5 (scan page 54), provides the size 00 exploded view. The 0-MXV project borrows this arrangement. The arbors, heights and tooth counts come from the supplied reconstruction, specifically `cad/scripts/{segment,w1,w2,star}.js` and book chapter 11. The 90-tooth equivalent sector and compound pairs give (90/6)(64/6)(60/6) = 1600 turns of the star per equivalent turn of the sector. That ratio was chosen to fit timing behavior.

[Open the joint graph](lab:show/graph) to find the three coaxial joints. [Inspect the train in plan](lab:view/stage?view=plan). The three external meshes reverse direction at each stage. In the script change `segmentAngle` from 0° to 0.05°; the ideal coupling rotates the star −80°. The lever, weight and pallet remain independent. The full shutter's baked release and calibrated average pallet drag belong to M-11. This preset exposes the CAD geometry and bearings.

**Unresolved wheel clearance.** In the archived CAD, both the first wheel and the segment occupy z = 11.95–12.25 mm. The kicker pin occupies z = 11.95–13.30 mm. Its centre is 2.44 mm from the first arbor, within the 3.2 mm pitch radius of that wheel. Archive chapter 13 §5 identifies the clash. Simply raising the wheel above the kicker would remove engagement with the second pinion, which ends at z = 13.00 mm. Record both wheel faces, both pinion faces and plate separation from a disassembled size 0 sample before changing the stack. The tooth ratios specify relative rotations even while this axial clearance remains open.
