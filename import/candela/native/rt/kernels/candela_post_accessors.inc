// candela_post_accessors.inc — members of struct Kernel for the display program: the WGSL prelude of the display
// shaders (render.ts `pre`): uniforms D, image width W, radiance cAt, albedo aAt, normal + depth nAt, and helpers.
__device__ static vec4f ld4(const float4* p, i32 i) { const float4 v = p[i]; return vec4f(v.x, v.y, v.z, v.w); }
__device__ vec4f D(i32 i) const { return ld4(post.dsp, i); }
__device__ i32 W() const { return i32(post.dsp[0].x); }
__device__ f32 sq(f32 x) const { return x * x; }
__device__ f32 lum(vec3f c) const { return dot(c, vec3f(0.2126f, 0.7152f, 0.0722f)); }
__device__ vec3f safeNorm(vec3f v) const { const f32 l = length(v); return l > 1e-20f ? v / max(l, 1e-20f) : vec3f(0.0f, 1.0f, 0.0f); }
__device__ vec3f cAt(vec2i p) const { const i32 i = p.y * W() + p.x; const vec4f v = ld4(post.src, i); return v.xyz() / max(v.w, 1.0f); }
__device__ vec3f aAt(vec2i p) const { const i32 i = p.y * W() + p.x; return ld4(post.aovA, i).xyz() / max(D(0).z, 1.0f); }
__device__ vec4f nAt(vec2i p) const { const i32 i = p.y * W() + p.x; const vec4f n = ld4(post.aovN, i) / max(D(0).z, 1.0f); return vec4f(safeNorm(n.xyz()), n.w); }
