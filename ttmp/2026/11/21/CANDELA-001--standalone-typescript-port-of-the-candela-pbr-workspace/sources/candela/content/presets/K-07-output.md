---
id: K-07
title: Output: stills, sequences, video, EXR passes
group: Machines
about: A turntable of a gear assembly to render out — a 4K still, a full turn as an MP4 or WebM video or a frame sequence, or multi-channel EXRs with depth and instance/face ids — through the render queue.
tries: Render the full turn as a 1280×720 MP4|Render a 1920×1080 still at 512 spp as EXR passes|Render the full turn as PNG frames at 640×360|Queue three stills with seeds 1, 2 and 3|Render a still from code with render.still()
docs: cad
paused: true
time: 1.2
focus: render
---
# Output

The viewport is progressive and adapts its size; **output** is the opposite — a fixed width, height, sample count and seed, so the same request gives the same pixels. Open the **Render** view:

- **Still** — at the current time or a given one. **Sequence** — a time range at a frame rate; for each frame the clock moves, behaviours step by 1/fps, `animation(t)` is evaluated (with its shutter samples when motion blur is on), and the frame is rendered from scratch. Exposure is metered on the first frame and then held, so the sequence does not flicker.
- **PNG** is the tone-mapped image, as shown. **EXR passes** is an OpenEXR file (32-bit float, uncompressed) with
  - `R G B A` — scene-linear beauty, scaled by the camera's exposure so mid-grey reads ≈ 0.18 (or absolute, in nits);
  - `albedo.R/G/B`, `N.X/Y/Z` — the denoiser's guides, averaged over the samples;
  - `Z` — distance along the camera ray to the first hit;
  - `id.instance`, `id.face` — which object and which CAD face the pixel shows, for mattes.
- **Seeds**: the random sequence is seeded; a sequence can change the seed per frame (noise reads as grain) or hold it (the same noise pattern every frame).
- **MP4** (H.264) and **WebM** (VP9) turn a sequence into a video, encoded by the browser (WebCodecs) as the frames are rendered. *Quality* sets the bitrate per pixel; path-traced frames carry fine noise, so give video more samples per pixel than a still preview would need — or more bitrate.
- Jobs run one after another on a **queue**; the clock pauses while it runs and comes back after. Sequences arrive as one `.zip` of numbered frames.

From code (the agent has these too):

```js
workbench.render({ kind: 'still', width: 3840, height: 2160, spp: 1024, seed: 7, format: 'exr' })
workbench.render({ kind: 'sequence', start: 0, end: 8, fps: 12, width: 640, height: 360, spp: 64 })
workbench.render({ kind: 'sequence', start: 0, end: 8, fps: 30, width: 1280, height: 720, spp: 96, format: 'mp4' })
```

A full turn here takes `period` seconds; at 12 fps a sequence of 8 s is 97 frames. For a loop, render from 0 to just under one period — `end: 8 - 1/30` at 30 fps — so the last frame is not the first again.

The clock starts **paused** on a still frame, so the image converges — with its motion blur, which comes from the speed, not from the clock running. Press **Pause** in the viewport to run it.
