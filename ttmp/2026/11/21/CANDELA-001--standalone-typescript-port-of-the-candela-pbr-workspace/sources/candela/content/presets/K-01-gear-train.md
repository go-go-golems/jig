---
id: K-01
title: A gear train in motion
group: Machines
about: Three spur gears as triangle meshes with CAD faces, dressed from part metadata, driven by poses from animation(t), with motion blur from the shutter.
tries: Run the input at 400 rpm and close the shutter to 45°|Make the idler bronze|Render a one-second sequence at 640×360|Click a tooth and read its face
docs: cad
paused: true
time: 0.35
focus: params
---
# A gear train in motion

Three involute spur gears — 20, 32 and 14 teeth, module 3 mm — on an anodized plate. Everything mechanical here is a **triangle mesh**: `mesh.gear(…)` tessellates the involute flanks and names the faces the way a CAD kernel would (`face-0`, `face-1`, `flank`, `tip`, `root`, `bore`).

**Materials from metadata.** No material is assigned by hand. Each part carries `{ material: 'steel' }` (or brass, stainless, aluminium) and each face carries its process; `.autoFinish()` turns that into a finish: the flat faces are *faced* (concentric grooves), the tips *turned*, the flanks *hobbed*. The grooves are anisotropic highlights, oriented by a tangent field per face. Click a tooth to see its definition, instance, face and metadata.

**Poses from outside the scene graph.** The file exports

```js
export const animation = t => ({ input: { position, rotation }, idler: …, output: … });
```

— a pose per id, which is what an animation engine or a kinematic solver hands a renderer. Here it is a few lines of gear kinematics: each gear turns at `−zA/zB` of the one driving it, started at the angle that puts a gap where its neighbour has a tooth. Poses can also be pushed from the page: `workbench.setPoses({ … })` or `postMessage({ type: 'candela.poses', poses })`.

**Motion blur.** `camera.motionBlur({ angle: 180°, fps: 24, steps: 8 })` samples the poses at eight instants across the shutter; each object gets those eight rigid transforms, every camera sample picks a time, and the acceleration structure is built around the swept boxes. At 60 rpm the outer teeth of the idler move about 4 mm while the shutter is open.

Set the rpm to zero and the blur goes away; set the shutter to 0° for a frozen frame.

The clock starts **paused** on a still frame, so the image converges — with its motion blur, which comes from the speed, not from the clock running. Press **Pause** in the viewport to run it.
