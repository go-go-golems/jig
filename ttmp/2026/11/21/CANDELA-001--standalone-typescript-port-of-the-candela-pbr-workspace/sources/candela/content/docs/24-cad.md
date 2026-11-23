---
id: cad
title: CAD: meshes, poses, finishes, output
group: The engine
about: triangle meshes with face ids and two-level acceleration, poses from an animation engine, motion blur, anisotropic finishes from metadata, HDRI lighting, EXR passes, video and the render queue
order: 24
---
# CAD: meshes, poses, finishes, output

A renderer for mechanical CAD has a different input from a renderer for scenes someone sculpted: tessellated B-rep parts whose faces still have identities, assemblies that repeat parts hundreds of times, motion that comes from a kinematic solver or an animation engine rather than from the scene file, finishes that are named by process (*turned, ground, anodized*) rather than painted, studio and daylight HDRIs, and output that goes to a compositor. This page is how Candela handles each, and what it leaves out.

## Meshes with faces

A **definition** is triangles with a face index per triangle and a face table:

```js
const part = mesh.fromArrays({ positions, indices, normals, uvs, faceIds, faces: [{ id: 'bore', meta: { process: 'turned' } }, …], meta: { material: 'steel' } });
shape.mesh(part).at(…)          // an instance
```

Generators build common parts the same way, with faces named as a CAD kernel would: `mesh.box`, `revolve(profile)`, `cylinder`, `tube`, `shaft(steps)`, `torus`, `gear({ teeth, module, width, bore })` (involute flanks), `prism`, `hexBolt`, `nut`, `washer`, `bearing`, `merge(parts)`, `fromOBJ(text)` (groups become faces). `withMeta` and `withFaceMeta(selector, meta)` return a new definition that **shares** the triangles and the BVH.

Selectors (for `.face()`, `withFaceMeta`) are an id, a glob (`'d*'`), a RegExp, a list, or a predicate on `{ id, meta }`.

## Two levels of acceleration

- **Bottom level**, per definition: a BVH over the triangles in object space — binned SAH, 12 bins, leaves of up to 4 triangles (16 where the SAH says a leaf is cheaper than a split) — built once and cached on the definition. Triangles are stored ready for Möller–Trumbore: a vertex, two edges, three normals, three uvs and the face index, 7 vec4s each.
- **Top level**: the scene's BVH over objects, where a mesh instance is an object like a sphere: a transform, a material, a pointer to its definition's nodes and triangles. It is rebuilt on every repack (median splits), which is cheap because it holds instances, not triangles.

A ray that enters an instance's box is transformed into object space and walks the definition's BVH with a fixed stack; the closest triangle records its barycentrics and its face. Shading interpolates the normals and uvs, and looks the face up in a **face table** — one material id per face, or −1 for the instance's own material.

All of this lives in one **scene data** buffer (a storage buffer on WebGPU, an RGBA32F texture 1024 texels wide on WebGL2): a static head with mesh BVHs and triangles, face tables and HDRI tables, uploaded when the scene is built; and a dynamic tail with the media and motion blocks, rewritten on every repack. Keeping it to one buffer holds the kernel to WebGPU's guaranteed eight storage buffers per stage.

## Faces and materials

Three ways, in precedence order: an explicit `.face(selector, material)`; `.autoFinish()`, which turns part + face metadata into a finish; and the instance's `.material()`. `autoFinish(fn)` takes `(meta, face) => material` instead. Each distinct material is compiled once and shared.

## Finishes

`finish.*` returns `material.pbr()` builders: a measured normal-incidence reflectance for the metal and a roughness and anisotropy for the process.

**Anisotropy** follows Burley (2012): with aspect a = √(1 − 0.9·anisotropy), the GGX α along the tangent is α·a and across it α/a — the surface is smoother along the grooves than across them, so highlights stretch *across* the grooves. The tangent is an object-space **field**: `fx.tangent.around(axis, centre)` (circles: turned, faced), `along(dir)` (brushed, ground, hobbed), `radial`. At a hit it is carried to world space, projected into the shading plane and turned by `anisotropyRotation`.

`finish.fromMetadata(meta)` reads `material` (steel, stainless, bearing-steel, cast-iron, aluminium, brass, bronze, copper, titanium, chrome, nickel, zinc, gold; polymers abs, nylon, pom, peek, ptfe, pla, pc, rubber, epdm…), `process` (turned, faced, milled, ground, brushed, hobbed, polished, cast, forged), `finish` (black-oxide, zinc, yellow-zinc, anodized[-black|-clear], paint, powder-coat, chrome, nickel) and `color`, `axis`, `center`, `direction`, `roughness`. Conversion coatings keep the process's grooves; paint and powder coat hide them.

## Poses

Motion for an assembly usually comes from outside: a solver, a rig, an animation engine. Its output is a **pose per id**:

```js
export const animation = t => ({ crank: { position, rotation }, rod: matrix16, … });
workbench.setPoses({ … } | t => ({ … }) | null);           // from the page
postMessage({ type: 'candela.poses', poses }, '*');          // from another frame
```

A pose is a 16-number column-major matrix (three.js, glTF), `{ matrix }`, `{ position, quaternion }` or `{ position, rotation }` (Euler XYZ), with optional `scale`. A **world** pose replaces everything above the node it names (the deepest posed node on a chain wins); a **local** pose (`local: true`) replaces only the node's own transform. Poses from the page win over `animation`, id by id. An id that names no node is **W170**.

A pose update is a **repack**: object transforms, the top-level BVH and the motion blocks are rewritten; mesh BVHs, materials and shaders are not.

## Motion blur

`camera.motionBlur({ angle, fps, steps } | { shutter, steps })` samples the scene at `steps` instants across the shutter, centred on now: poses, fields of time and animated params. For each object that moves, the compiler stores P_k = M_k · M_c⁻¹ — the motion relative to the shutter centre — decomposed into a quaternion, a translation and a uniform scale. Each camera sample draws a time τ in the shutter (stratified across the samples a pixel takes in one frame); the kernel interpolates between the two nearest steps (normalised lerp of quaternions, lerp of translation and scale) and maps the ray into the object by P(τ)⁻¹ and then M_c⁻¹. The object's BVH box is the union of its boxes over the sweep, padded for the arcs a rotating box's corners trace between steps.

Limits: rigid motion and uniform scale only (no deformation); the camera itself is not blurred; light *from* a moving emitter is sampled at the shutter centre.

## HDRIs

`light.env.hdri(image, { intensity | luminance, rotate })` takes `hdri.studio({ boxes })`, `hdri.outdoor({ sunElevation, sunAzimuth })`, `hdri.parse(bytes)` (Radiance RGBE), or the name of a dropped asset. The map is equirectangular, y up, u = ½ looking along −z.

At build time the image is box-filtered to at most 1024 texels wide and turned into two tables: per texel its radiance and its pdf, and a **Vose alias table** with probabilities ∝ luminance · sin θ. Sampling picks a texel in O(1), jitters inside it, and converts the pdf from texel space to solid angle, p(ω) = p(u, v) / (2π² sin θ). Escaping paths look up the same pdf, so environment light is combined with BSDF sampling by MIS — a tiny sun and a dim sky both converge.

## Output

`workbench.render(opts)` (and the Render view) queues **jobs**: stills and sequences at a fixed size, sample count and **seed**. The seed enters the per-pixel random stream, so identical inputs give identical pixels; sequences can add the frame number to the seed or hold it. A sequence moves the clock frame by frame — behaviours step by 1/fps, poses are evaluated, motion blur is resampled — renders each frame from scratch, and meters exposure once.

**EXR passes**: OpenEXR 2.0, single-part scanline, uncompressed, 32-bit float channels, sorted as the format requires: `A B G R` (beauty, scene-linear, × exposure or absolute nits), `albedo.R/G/B`, `N.X/Y/Z`, `Z` (distance along the ray), `id.instance`, `id.face`. Ids and depth come from a separate **id pass**: one pinhole ray per pixel, first hit, unfiltered, rendered into the accumulation buffer after saving it and restored afterwards, so the beauty is not disturbed. Sequences are packed into a store-only ZIP.

**Video.** A sequence can also be written as **MP4** (H.264, High profile, the level chosen from the frame size and rate) or **WebM** (VP9, or VP8). Each frame is the tone-mapped image, handed to the browser's WebCodecs encoder as it is rendered; the containers are written here — ISO BMFF with the index first (*fast start*: `ftyp`, `moov`, then `mdat`, with `avcC`, colour `colr` and sync samples) and Matroska with a seek head and cues. Bitrate is set as bits per pixel per frame (draft 0.06 … max 0.4), more than a camera needs: path-traced frames at modest sample counts carry fine noise, and noise is what codecs spend bits on. A keyframe every two seconds by default. Where the browser has no WebCodecs encoder (**E730**), render PNG frames and join them with `ffmpeg -framerate 24 -i name.%04d.png -pix_fmt yuv420p name.mp4`.

## Not here

Double precision and camera-relative coordinates for very large assemblies; BVH refitting (the top level is rebuilt); level of detail; compressed EXR, deep or multi-part EXR, Cryptomatte; deformation blur and camera blur; texture maps on meshes (uvs are carried, fields can read them); NURBS or B-rep evaluation — parts arrive tessellated.
