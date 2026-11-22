// 04-dawn-probe.mjs — does Dawn (the `webgpu` npm package, Node bindings) reach the GB10 natively?
// Run in a scratch dir: npm init -y && npm install webgpu && node 04-dawn-probe.mjs
import { create, globals } from 'webgpu';
Object.assign(globalThis, globals);
const gpu = create([]);
const a = await gpu.requestAdapter({ powerPreference: 'high-performance' });
console.log(JSON.stringify({ info: a && a.info && { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description }, limits: a && { maxStorageBuffersPerShaderStage: a.limits.maxStorageBuffersPerShaderStage, maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxBufferSize: a.limits.maxBufferSize, maxComputeWorkgroupsPerDimension: a.limits.maxComputeWorkgroupsPerDimension }, features: a && [...a.features] }, null, 1));
process.exit(0);
