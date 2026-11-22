# Accelerating bracket

The mount accelerates upward at 25 g. In the bracket's frame, inertia acts downward through the material, so the arm bends even though its tip carries no applied force. The study uses aluminium with explicit modulus and strength values.

> **Try it.** In Code, change `.solver('js')` to `.solver('ccx')` and run again. The two solvers use the same TetGen mesh and should give nearly identical stress and displacement for this case. Double the acceleration to 50 g and see how the results scale.

The **Stage** and **Trace** identify the active solver. This study treats the acceleration as a steady load in the bracket's frame. It does not simulate the bracket's motion over time.
