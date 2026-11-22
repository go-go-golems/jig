// 01-gpu-probe.ts — which GPU does headless Chromium reach on this machine, per flag set?
// Prints the WebGL2 renderer string and the WebGPU adapter info for each configuration.
// Run from the repo root: npx tsx <this file>
import { chromium } from 'playwright';
import http from 'node:http';

// WebGPU is exposed only in secure contexts: serve a blank page on localhost
const srv = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>probe</title>'); }).listen(8791);

const CONFIGS: Record<string, { headless: boolean | 'new'; channel?: string; args: string[] }> = {
  'swiftshader (old harness)': { headless: true, args: ['--use-angle=swiftshader'] },
  'headless-shell + vulkan': { headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-unsafe-webgpu'] },
  'chromium new-headless + vulkan': { headless: true, channel: 'chromium', args: ['--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] },
  'chromium new-headless + vulkan + gl=angle': { headless: true, channel: 'chromium', args: ['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] },
  'headless-shell + vulkan + webgpu adapter flags': { headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan,WebGPUExperimentalFeatures', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-webgpu-adapter=default'] },
  'chromium new-headless + egl (no vulkan)': { headless: true, channel: 'chromium', args: ['--use-gl=egl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan'] },
};

for (const [name, c] of Object.entries(CONFIGS)) {
  let out: unknown;
  try {
    const b = await chromium.launch({ headless: c.headless === true, channel: c.channel, args: c.args });
    const p = await b.newPage();
    await p.goto('http://localhost:8791/');
    out = await p.evaluate(async () => {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl2') as WebGL2RenderingContext | null;
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const webgl = gl ? (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no webgl2';
      const floatRT = gl ? !!gl.getExtension('EXT_color_buffer_float') : false;
      let webgpu: unknown = 'navigator.gpu missing';
      const g = (navigator as any).gpu;
      if (g) {
        const a = await g.requestAdapter({ powerPreference: 'high-performance' }).catch((e: Error) => 'error ' + e.message);
        webgpu = a && typeof a === 'object' ? { info: { vendor: a.info?.vendor, architecture: a.info?.architecture, device: a.info?.device, description: a.info?.description }, maxStorageBuffersPerShaderStage: a.limits.maxStorageBuffersPerShaderStage, maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxBufferSize: a.limits.maxBufferSize, f16: a.features.has('shader-f16') } : String(a);
      }
      return { webgl, floatRT, webgpu, ua: navigator.userAgent };
    });
    await b.close();
  } catch (e) { out = 'launch failed: ' + (e as Error).message.split('\n')[0]; }
  console.log('## ' + name + '\n' + JSON.stringify(out, null, 1));
}

srv.close();
