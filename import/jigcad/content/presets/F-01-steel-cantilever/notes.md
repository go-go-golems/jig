# Steel cantilever

A 60 × 6 × 6 mm steel beam is clamped at one end. The study distributes a 20 N downward force over the tip face. The Stress overlay marks the stress near the clamp. The default case gives about 34.3 MPa peak stress and 0.0668 mm maximum displacement. Beam theory with shear predicts 0.0672 mm.

> **Try it.** [Double the load to 40 N](lab:param/F=40) and compare the displacement. [Set it to 50 N](lab:param/F=50) to bring the safety factor below 3 and trigger a finer mesh. [Try 60 N](lab:param/F=60) to exceed the 0.18 mm displacement limit. [Restore 20 N](lab:param/F=20).

The fixture and load use faces named by the extrude, so they follow edits to the beam. The displacement check uses the tip face. The safety factor compares the computed peak stress with the selected material strength. Check **Trace** for the element count, solver and refinement details.
