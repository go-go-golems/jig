# Changelog

## 2026-11-14

- Mechanism solver, builder methods, ProgramData.assembly, Mechanism view, engine tests 43–46.
- The Joints overlay on the stage; compiling a mechanism to kine (prog.kine, call 'kine', export 'kine'); engine test 47.
- Gear, rack and belt couplings from the teeth and the axes, couplings on turned values, `jig.linear` in kine; interference over a study with overlap volumes; engine tests 48–49.
- Drag to pose: MechanismSolver.drag and holds, prog.dragPose and the worker call, port handles on the stage with the pose drawn ahead of the compile; engine test 50.
- Review fixes (PR #1): flipped closures rejected (`MechanismSolver.flips`), an unreachable study start is a gap, kine roots fixed bodies at their placement, the Mechanism view shows a failed compile's conflict; engine test 51.
