# native/optix — Candela on OptiX (CANDELA-002 step 3)

Work in progress. Today this directory holds the **traversal spike**: `candela-optix-ao` loads a version-0 scene
package (`scripts/scene-package.ts`: triangles, instance transforms, camera) and runs Candela's AO integrator on
the RT cores. It is a measurement tool and the seed of the backend, not a renderer yet (no materials or lights).

```sh
npx tsx scripts/scene-package.ts K-09                       # → ~/data/pbr-spark/packages/K-09/{scene.json,geometry.bin}
cmake -G Ninja -S native/optix -B build/optix               # -DOptiX_INSTALL_DIR=… if the SDK is elsewhere
ninja -C build/optix
./build/optix/candela-optix-ao ~/data/pbr-spark/packages/K-09 --spp 1024 --radius 0.05 --out ao.exr
```

Requirements: CUDA 13 (`/usr/local/cuda/bin` on `PATH`), the OptiX SDK **9.0.0** headers (default
`~/opt/NVIDIA-OptiX-SDK-9.0.0-linux64-aarch64`; SDK 9.1 needs a newer driver than 580), CMake ≥ 3.24, Ninja.
`nlohmann/json` is fetched by CMake when not installed (`sudo apt install nlohmann-json3-dev` to use the system one).

Files: `src/params.h` (launch parameters), `src/ao.cu` (raygen, closest hit, misses → OptiX-IR at build time),
`src/main.cpp` (package loading, GAS per mesh, IAS, pipeline, SBT, timing, EXR output).

On K-09 at 1080p this traces 1,721 full-frame AO samples/s against 105 for the WebGPU kernel
(CANDELA-002 `various/11-optix-ao-spike.txt`).
