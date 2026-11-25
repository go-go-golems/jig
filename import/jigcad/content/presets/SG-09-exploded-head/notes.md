# Explode, assemble and stitch

Press **Play** in CAD Stage. The casting stays fixed as the needle drive opens to the left, the take-up linkage opens above it and the presser assembly opens to the right. The foot separates from its shank. Pause during the full-spread hold to inspect individual parts, or drag the sample slider.

The parts return to their solved positions before the shaft makes two revolutions. The needle changes sides and returns to its starting position. The presser foot stays down on both strokes. Loop starts enabled and can be switched off during playback.

All 29 occurrences use the SG-03 and SG-06 part definitions. The spread distances are illustration offsets in millimetres. They do not specify service removal paths. The hook, bobbin and feed mechanism lie outside this upper-head model.

**Show → Component names** toggles the callouts. During this presentation their opacity follows the spread, including when you scrub backwards. Exit preview to see the labeled assembled head.

The optional render shot is authored in the study's `shot` array in Code. Key times are seconds from the beginning of the 13-second presentation. `surface` sets the PBR contribution, `edges` sets line opacity, and `annotations` sets label opacity. Numeric channels interpolate independently. Component selections change at their keyed times. At eight seconds the authored shot isolates the presser assembly and sections its guide along the local Y plane. At ten seconds it restores the complete head, tints the crank, connecting rod and needle bar teal, and draws an orange 1.5-second trail of the needle tip. The measured point is 17 mm below the needle occurrence origin. To change the timing, edit the keys and press **Run**.
