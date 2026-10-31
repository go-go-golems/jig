# Extrude and revolve

A plate 80 × 50 × 4 mm with four M3 clearance holes, and a ring revolved on top of it. The two features have closed-form volumes, so the kernel's answer can be checked by hand: an extrude is its profile's area times its height (Cavalieri), a revolve is its section's area times the distance its centroid travels (Pappus).

> **Try it.** [Select the plate's underside](lab:select/body/start), then [look from the side](lab:view/stage?view=side). [Move the ring out to 22 mm](lab:param/ring_r=22) and compare the volume in the header.

## The extrude

The profile is a rounded rectangle with four circles inside it. Circles inside a closed outline are holes of the profile, so one extrude makes the plate with its holes already cut:

$$V = (80 \cdot 50 - 4 (1 - \pi/4) 4^2 - 4 \pi 1.7^2) \cdot 4$$

## The revolve

The section is a 3 × 8 mm rectangle on the XZ plane whose centroid sits `ring_r` from the Z axis. A full turn sweeps it into a ring of volume $2 \pi \cdot r \cdot A$: 18 mm × 24 mm² × 2π is about 2,714 mm³. The revolve starts on the plate, so the compiler joins it to the plate's body and records that as a [decision](lab:show/trace).

> **Exercise.** Halve `ring_t` and predict the new volume of the ring before you press Run.
