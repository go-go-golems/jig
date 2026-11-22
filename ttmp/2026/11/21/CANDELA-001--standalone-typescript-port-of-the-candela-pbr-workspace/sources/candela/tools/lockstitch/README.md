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

3. **Render** headless (Chromium, WebGL2 through SwiftShader on a machine with no GPU; a real GPU is ~100× faster):

   ```sh
   node tools/lockstitch/render.js --size 960x540 --spp 8 --fps 24 --stitch 2 --format mp4 --out out/
   node tools/lockstitch/render.js --still --size 1920x1080 --spp 64 --scenes 3,7
   node tools/lockstitch/render.js --scenes 7 --turns 4 --orbit -12 --name S-07-whole-head   # four stitches, the camera swinging 48°
   sh tools/lockstitch/reel.sh out/                                                           # all seven, captioned, one MP4
   ```

   Options: `--scenes 1,…,7`, `--size WxH`, `--spp`, `--fps`, `--stitch` (seconds per stitch), `--turns`,
   `--format mp4|webm|png`, `--quality draft|standard|high|max`, `--still [--time s]`, `--backend webgl2|webgpu`,
   `--orbit` (degrees per stitch the camera swings about the vertical), `--name` (file stem, for one scene).
   Each video is one stitch (two for the zigzag), and ends one frame before it starts again, so it loops.

## Not carried over

The original page's section cuts, the drawn thread and its line work (silhouettes, B-rep edges), the plots and
checks. The geometry and the motion are the same data.
