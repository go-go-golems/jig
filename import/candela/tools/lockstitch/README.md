# Lockstitch head → Candela

The lockstitch head (a sewing machine mechanism modelled in jig and animated by a kine rig) as a Candela preset,
`K-09 Lockstitch head`, and a command-line renderer for its seven scenes.

## Pipeline

1. **Convert** the original animation page's data into a Candela module:

   ```sh
   python3 -I tools/lockstitch/convert.py meshes.json rigdata.json content/presets/K-09-lockstitch/lockstitch-data.js
   ```

   - `meshes.json`: the OpenCascade tessellation of every part — per body, positions, normals, indices, the B-rep
     face of every triangle, face names and kinds (plane, cylinder, cone, bspline).
   - `rigdata.json`: the kine rig evaluated at 1° (a world frame per joint per degree, two spans: one turn, and two
     turns with the zigzag gate swinging), plus the outputs (feed lift and advance …).

   The converter changes the frame (CAD: mm, z up, the machine's front toward −y → Candela: metres, y up, front
   toward +z), quantises the meshes (int16 positions in each body's box, int16 normals, uint16 indices and faces),
   converts the joint frames (position and quaternion per degree; the zigzag span only for the four joints the gate
   moves), integrates the cloth's travel from the feed dog (it moves only while the dog is above the plate), and
   works out finish metadata per face: for parts made on a lathe, the axis of the largest cylindrical face (the
   eigenvector of the normals' scatter, then a circle fit) — coaxial cylinders are *turned*, flat faces across the
   axis *faced* — and an isotropic machined finish elsewhere.

2. **The preset** (`content/presets/K-09-lockstitch.js`) builds a `shape.mesh` per body, grouped under each part's
   id, dresses them with `.autoFinish()`, and exports `animation(t)`, which interpolates the baked frames (lerp of
   positions, nlerp of rotations) and returns a pose per part. Its **Scene** param is the original page's seven
   scenes; each frames its region from the original's view direction.

3. **Render** headless on the GPU (`npm run build` first; Playwright's headless shell with ANGLE-on-Vulkan and
   WebGPU flags; it refuses a software rasteriser unless `--allow-software`). Output defaults to
   `~/data/pbr-spark/lockstitch/`. On the DGX Spark one 1080p stitch at 64 spp (48 frames) takes ~3.9 min.

   ```sh
   npx tsx tools/lockstitch/render.ts --size 960x540 --spp 8 --fps 24 --stitch 2 --format mp4
   npx tsx tools/lockstitch/render.ts --still --size 1920x1080 --spp 64 --scenes 3,7
   npx tsx tools/lockstitch/render.ts --scenes 7 --turns 4 --orbit -12 --name S-07-whole-head   # four stitches, the camera swinging 48°
   sh tools/lockstitch/reel.sh ~/data/pbr-spark/lockstitch                                      # all seven, captioned, one MP4
   ```

   Any other preset renders the same way: `npx tsx scripts/render-preset.ts <id> [--param id=value]…`.

   **On candela-rt** (`--engine rt`, CANDELA-002 phase 4): the same scene program translated to CUDA, traced with
   OptiX on the RT cores (moving parts blurred through SRT motion transforms), the workbench's own display program,
   NVENC video. Build it first (`npx tsx scripts/bundle-core.ts`, then `cmake -S native/rt -B build/rt -G Ninja &&
   ninja -C build/rt`). One 1080p stitch of S-07 at 64 spp: 45 s, against 224 s in the browser on the same machine.

   ```sh
   npx tsx tools/lockstitch/render.ts --engine rt --scenes 1,2,3,4,5,6 --size 1920x1080 --spp 64
   npx tsx tools/lockstitch/render.ts --engine rt --scenes 7 --turns 4 --orbit -12 --name S-07-whole-head --size 1920x1080 --spp 64
   sh tools/lockstitch/reel.sh ~/data/pbr-spark/lockstitch
   ```

   Or one scene directly: `./build/rt/candela-rt render K-09 --param "scene=S-03 Rotary hook" --param stitch=2
   --sequence --start 0 --end 1.9583 --fps 24 --spp 64 --size 1920x1080 --format mp4,png`.

   Options: `--scenes 1,…,7`, `--size WxH`, `--spp`, `--fps`, `--stitch` (seconds per stitch), `--turns`,
   `--format mp4|webm|png`, `--quality draft|standard|high|max`, `--still [--time s]`, `--backend webgl2|webgpu`,
   `--orbit` (degrees per stitch the camera swings about the vertical), `--name` (file stem, for one scene).
   Each video is one stitch (two for the zigzag), and ends one frame before it starts again, so it loops.

## Not carried over

The original page's section cuts, the drawn thread and its line work (silhouettes, B-rep edges), the plots and
checks. The geometry and the motion are the same data.
