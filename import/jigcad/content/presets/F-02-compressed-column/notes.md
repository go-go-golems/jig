# Column under pressure

A 10 × 10 × 100 mm PLA column carries a uniform 0.01 MPa pressure on the top face plus its own weight. A roller on the base and one on each of two side faces stop motion normal to those faces. The sides can still slide vertically, so the column can shorten under pressure.

> **Try it.** [Double the pressure](lab:param/p=0.02) to add another 1 N of load. [Restore the starting pressure](lab:param/p=0.01), then remove `.gravity()` in Code and run again. With just the pressure, the base reaction is 1 N and the shortening is pressure times height divided by Young's modulus.

With gravity, the base reaction is about 1.122 N. A Stage view shows the stress pattern. To see the applied loads and reactions, ask the agent for `await fea.result()`.

This is a linear compression study. Predicting buckling requires a different analysis.
