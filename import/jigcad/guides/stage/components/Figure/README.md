# Figure

The rider: a 22-joint skeleton carrying 19 lofts in six chains, posed from the simulation every frame and drawn in hairlines.

**Provide**, in the workbench, nothing: `figure({ rider, board, intent, push })` adds the view. Outside it, `FormSkateStage.figurePose({ crouch, lean, pushing, phase, deck })` poses a regular-stance rider on a deck at rest with the figure's own code, and `FormSkateStage.drawFigure(g, pose)` draws it.

- Chains: `legL`, `legR`, `armL`, `armR`, `head`, `torso`. With chain outlines on (the default) each chain is one outline, so knees, elbows and the waist show no seams.
- The head is biased 6 cm toward the viewer so the face is not hidden by the neck; the face is a decal (eyes and mouth change in the air and in a bail).
- The Rig overlay adds violet sticks, 2.2 px hollow joints and the centre of mass as a 3.5 px `st-rec` dot labelled `COM`.
- Don't move the figure to change the physics: it is a view, and reads the simulation without pushing on it.
