// params.h — launch parameters shared by the host (main.cpp) and the device programs (ao.cu).
#pragma once
#include <optix.h>
#include <cuda_runtime.h>

struct LaunchParams {
  float4* accum;             // per pixel: rgb = sum of AO, w = number of camera rays that hit
  unsigned width, height;
  unsigned frame;            // index of the first sample in this launch (seeds the RNG)
  unsigned spp;              // samples per pixel in this launch
  float3 eye, right, up, fwd;  // Candela camera rows U1..U4: dir = normalize(fwd + right·ndc.x + up·ndc.y)
  float aoRadius;
  OptixTraversableHandle handle;
};

// payload slots for the camera ray: t (−1 on miss) and the world-space geometric normal
enum { RAY_CAMERA = 0, RAY_SHADOW = 1, RAY_TYPES = 2 };
