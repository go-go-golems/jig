// candela_optix_params.h — launch parameters of the OptiX target (CANDELA-002 phase 3): the plain-CUDA target's
// buffers (same order, so candela_accessors.inc serves both) plus the instance acceleration structure and the object
// index of each custom primitive. OptiX copies the launch parameters into `params` for every launch.
#pragma once
#include <optix.h>
struct CandelaParams {
  const float4* U;
  const float4* O;
  const float4* LI;
  const float4* BV;            // unused on OptiX (traversal is OptiX's), kept for the common layout
  const float4* SD;
  float4* accum;
  float4* aovA;
  float4* aovN;
  OptixTraversableHandle ias;  // meshes (one instance each) + one instance of the analytic GAS
  const int* aabbObjects;      // custom primitive index → object index in O
  const int* sphereObjects;    // built-in sphere primitive index → object index in O
};
extern "C" { __constant__ CandelaParams params; }

// visibility masks: camera rays see everything; shadow rays skip glowing objects (flags & 1), as traceAll does
#define CANDELA_MASK_CAMERA 1u
#define CANDELA_MASK_SHADOW 2u
