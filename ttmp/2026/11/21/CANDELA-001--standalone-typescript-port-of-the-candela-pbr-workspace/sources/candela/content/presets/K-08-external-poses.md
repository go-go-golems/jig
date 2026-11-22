---
id: K-08
title: Poses from an animation engine
group: Machines
about: A robot arm whose links are posed by world matrices from outside the scene graph — forward kinematics standing in for an animation engine — and by anything posted to the page.
tries: Freeze the arm with workbench.setPoses({ upper: { position: [0, 0.075, 0], rotation: [0.3, 0, 0] } })|Speed it up and watch the motion blur on the gripper|Clear the external poses|Make the base cast iron, unpainted
docs: cad
paused: true
time: 2.2
focus: notes
---
# Poses from an animation engine

The arm is nested groups with ids — `turret` › `upper` › `fore` › `gripper` › `finger-l`, `finger-r` — but nothing in the scene graph moves. Its motion arrives as **poses**: a transform per id, per instant, the interface between an animation system and a renderer.

Here `animation(t)` plays the animation engine: forward kinematics from three joint angles, returning **4×4 column-major world matrices**, the layout three.js and glTF use. A world pose replaces everything above the node it names, so `fore` is placed by its own matrix even though it sits inside `upper`. The fingers are **local** poses — `{ position, local: true }` — which replace only their own transform under the posed gripper.

**From outside the file.** A real engine runs elsewhere. Poses pushed into the page win over `animation`, id by id:

```js
workbench.setPoses({ upper: { position: [0, 0.075, 0], quaternion: [0.15, 0, 0, 0.99] } })   // fixed poses
workbench.setPoses(t => myEngine.evaluate(t))                                           // a function of time
workbench.setPoses(null)                                                                // back to animation(t)
// or, from another frame or window:
target.postMessage({ type: 'candela.poses', poses: { gripper: matrix16 } }, '*')
```

Accepted forms: a 16-number column-major matrix, `{ matrix }`, `{ position, quaternion: [x, y, z, w] }`, `{ position, rotation: [x, y, z] }` (Euler XYZ, radians), each with an optional `scale` and `local`.

**Every pose update is a repack, not a rebuild**: the object transforms and the top-level BVH are rewritten, the triangle BVHs and the shaders stay. With motion blur on, poses are evaluated at each shutter sample — a function of time gives the blur; fixed poses give none.

The clock starts **paused** on a still frame, so the image converges — with its motion blur, which comes from the speed, not from the clock running. Press **Pause** in the viewport to run it.
