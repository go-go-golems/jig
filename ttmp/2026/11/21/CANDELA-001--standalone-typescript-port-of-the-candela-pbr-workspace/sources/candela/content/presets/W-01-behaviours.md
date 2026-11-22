---
id: W-01
title: Behaviours
group: Live
about: .behavior((self, { t, dt }) => …) runs on the host every frame and moves things by transform overrides — a repack, never a recompile.
tries: Make the ball bounce higher|Give the lamp a behaviour that swings it|Pause the clock and step it with the agent
docs: architecture
---
# Behaviours

A behaviour is plain JavaScript that runs **every frame on the host**:

```js
shape.sphere(0.2).id('ball').behavior((self, { t }) => { self.position.y = 0.2 + Math.abs(Math.sin(t * 3)) * 0.8; })
```

`self.position`, `self.rotation` and `self.scale` write **overrides** for that node's transform. The scene is re-packed (objects, lights, BVH refit) — a millisecond — and the kernel stays as it is. Behaviours need an `.id()` so their state survives rebuilds.

Use behaviours for motion that is easiest to write as code: physics-ish bounces, following another object, reacting to `world`. Use **fields of time** (`fx.time()`) for motion that is a simple function of $t$ — those can also run inside the kernel.
