# Singer 44S rotary hook and Class 15 bobbin

Press **Play** in CAD Stage to see a 50° window of the shaft around the hook pass. Open **Render… → Preset animation** for the cutaway. The section moves through the plate, removable case and bobbin during the first 1.2 seconds. The rotating hook remains whole. At sample **60 of 120** (2 seconds), its point is directly behind the rising needle. The Mechanism study records bar rise and the relative X and Y coordinates of the two inspection points.

## What the service figures specify

Singer service manual 104 73 14-26 §3-11 sets width 6 and places the holder point behind the needle center at 3.5 mm of bar rise. The procedure does not give a shaft angle. Section 3-12 separately removes the shuttle and checks the right-side rising needle for 0.05–0.10 mm clearance to the holder point. SG-10 chooses the right-hand event and the midpoint, 0.075 mm, as its comparison setup. The removable case is sectioned in the presentation so the relationship to the bobbin is visible. Its fitted position does not determine the hook-to-needle gap.

The family parts-book distinguishes the rotating G25 holder (416479801) from the removable M25 shuttle hook complete (270 Q6A0764000). The M41 plastic bobbin is 270 006084009. The owner’s book specifies transparent Class 15. The CAD study uses a 21 mm × 12 mm envelope with an opaque tint for inspection. Flange thicknesses, hub, oil-free cup detail and stationary case geometry are estimated. The bobbin stays fixed during this short unloaded inspection. Thread payout and stitch formation are outside this model.

## How the model is registered

The shared Singer library supplies the needle, plate and crank–rod–slider law. Positive X points right, positive Y points behind the needle, and the plate surface is Z=0. The model uses the SG-08 nominal lateral amplitude and a constant right gate angle across the inspection window. It finds the actual minimum of the bar coordinate at that angle and solves the rising shaft phase numerically. The width dial does not specify that gate angle in degrees.

The upper-head study used an estimated working height. In SG-10 the ring top is estimated at Z=−4.0 mm. The shared needle’s straight-stitch bottom-dead-center butt is registered 28.5 mm above that ring using §3-10. This shifts the needle path down 11.4 mm relative to the earlier study. Hook radius (15 mm), two hook turns per shaft revolution and the position along the scarf are modeling estimates. The service manual supplies no numerical eye-to-point height for this pass.

The compiled event is **40.022°**, **3.500 mm rise** and **0.075 mm point-to-scarf distance**. The point is about **1.998 mm above the eye’s upper edge** in this geometry. Script 02 in SINGER-003 checks both witness points against the OpenCascade solids and samples all component pairs at all 121 sampled poses through this window. The curve labeled “Point minus scarf Y” is a directional coordinate difference throughout the study. It equals the verified point-to-surface distance at the aligned event.

## Reuse

SG-10 imports the canonical SG-03 Singer part library via a preset symlink. Its local hook library exports the M25 case, M41 bobbin, G25 holder and setup function. Add that file to another preset's project file map to reuse it through `await importPartFile('hook.parts.js')`.
