# Slider-crank rod

A steel connecting rod drives a needle bar at 3000 strokes per minute. The mechanism study sweeps the crank with gravity and a 4 N load during needle contact. The stress study imports the rod's joint loads and inertia from the sampled pose with the greatest sum of joint-force magnitudes.

The Stress stage shows the rod. Select **View source mechanism** to see the [frame, crank, rod and slider together](lab:preset/F-06), pose the crank, and inspect the reaction plots.

Jig finds the two bearing surfaces from the port axes. It holds the bore toward the crank and distributes the wrist load over the other bore. The default study gives about 16.3 MPa peak stress. **Trace** records the selected pose, and the study checks the held-seat reaction against the mechanism result.

> **Try it.** Change `at: 'worst'` to `at: deg(90)` in Code and run again. Compare the stress and the seat reaction. Ask the agent for `await fea.result()` and `await fea.faces()` to compare the load case and peak faces numerically.

The automatic pose selection ranks joint force magnitudes. Different poses can produce different load directions and stress patterns.
