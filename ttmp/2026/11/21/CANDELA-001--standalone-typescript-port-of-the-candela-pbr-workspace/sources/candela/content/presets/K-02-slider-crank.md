---
id: K-02
title: A slider-crank, solved in JS
group: Machines
about: Crank, connecting rod and piston in a glass cylinder; a few lines of kinematics return world poses per id each frame, and the shutter blurs them.
tries: Spin the crank at 1200 rpm|Lengthen the stroke to 50 mm|Make the cylinder smoked glass|Render a sequence of one revolution
docs: cad
paused: true
time: 0.05
focus: params
---
# A slider-crank, solved in JS

The three moving parts are meshes with their own ids: `crank`, `rod`, `piston`. Their motion is a *solver*: given the crank angle θ, the crank pin is at r(−sin θ, cos θ), the piston pin is on the cylinder axis at a rod length from it, and the rod leans by ψ = asin(x_pin / L). `animation(t)` returns those three **world poses** — a position and a rotation — each frame:

```js
export const animation = t => ({ crank: { position, rotation: [0, 0, θ] }, rod: { … }, piston: { … } });
```

A pose replaces everything above the node it names, so a part can be posed wherever it sits in the scene's groups. Poses accept a 4×4 column-major matrix (as three.js and glTF store them), `{ position, quaternion }` or `{ position, rotation }` (Euler XYZ, radians), each with an optional scale.

**Motion blur** samples `animation` twelve times across a 180° shutter. The piston is not rotating, but the pin end of the rod sweeps an arc: each object's motion is stored as rotation + translation per sample and interpolated per camera sample, so arcs stay arcs instead of chords.

The parts are built the way an exporter describes them — merged sub-parts with prefixed face ids (`pin-side`, `big-bore`) — and dressed by metadata: the rod's flat faces are marked `process: 'forged'` with `withFaceMeta`, the crank pin `ground`, the piston aluminium with a faced crown. Click a part to see its faces.

The clock starts **paused** on a still frame, so the image converges — with its motion blur, which comes from the speed, not from the clock running. Press **Pause** in the viewport to run it.
