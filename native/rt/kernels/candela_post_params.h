// candela_post_params.h — launch parameters of the display program (CANDELA-002 phase 4): the WGSL display shaders'
// bindings (src/engine/render.ts, GPURenderer.compile `pre`) as pointers. `post` lives in constant memory; the host
// fills it before each launch.
#pragma once
struct CandelaPostParams {
  const float4* dsp;    // display uniforms, 32 rows (display.ts displayUniforms)
  const float4* src;    // radiance: the accumulation buffer (alpha = sample count) or a denoised image (alpha = 1)
  const float4* aovA;   // albedo sum
  const float4* aovN;   // normal sum, w = depth
  float4* dst;          // candela_denoise output
  uchar4* out;          // candela_display output: display-referred RGBA, 8 bits per channel, rows top-down
};
extern "C" { __constant__ CandelaPostParams post; }
