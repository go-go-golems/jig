// Portable Stage studios store the Candela scene source and its project look modules.
import { isLookFile, LOOK_FILE } from './files.js';

export const STUDIO_FILE = 'render-studios.json';

export function validateStudio(value) {
  if (!value || typeof value.source !== 'string' || !value.source.trim()) throw Error('A studio needs Candela scene source.');
  if (value.ev != null && !Number.isFinite(value.ev)) throw Error('Exposure must be a finite EV.');
  const modules = value.modules ?? {};
  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) throw Error('Invalid studio modules.');
  for (const [key, text] of Object.entries(modules)) {
    if (key === LOOK_FILE || !isLookFile(key) || key.split('/').some(s => !s || s === '.' || s === '..') ||
        key.includes('\\') || typeof text !== 'string') throw Error('Invalid studio module: ' + key);
  }
  return { source: value.source, ev: value.ev ?? null, modules };
}

export function readStudios(files) {
  const raw = files.get(STUDIO_FILE);
  if (raw == null) return { active: '', entries: new Map() };
  const value = JSON.parse(raw);
  if (value.version !== 1 || !Array.isArray(value.studios)) throw Error('Unrecognized render studios file.');
  const entries = new Map();
  for (const [name, studio] of value.studios) {
    if (!name || typeof name !== 'string' || entries.has(name)) throw Error('Invalid or repeated studio name.');
    entries.set(name, validateStudio(studio));
  }
  if (value.active && !entries.has(value.active)) throw Error('The selected studio is missing.');
  return { active: value.active || '', entries };
}

export function writeStudios(host, entries, active) {
  host.setFile(STUDIO_FILE, JSON.stringify({ version: 1, active, studios: [...entries] }, null, 2) + '\n');
}

export function projectStudio(files, defaultSource) {
  return validateStudio({ source: files.get(LOOK_FILE) ?? defaultSource,
    modules: Object.fromEntries([...files].filter(([k]) => k !== LOOK_FILE && isLookFile(k))) });
}

// A plain Candela scene remains editable and travels with the project. The
// environment sets illumination and background radiance in the material pass.
export function inspectionStudio({ top, bottom, illuminance, materialColor, address }) {
  if (![top, bottom, materialColor].every(color => /^#[\da-f]{6}$/i.test(color))) throw Error('Invalid studio color');
  if (!Number.isFinite(illuminance) || illuminance < 0) throw Error('Key illuminance must be nonnegative.');
  const override = address.trim() ? '\n  .material(' + JSON.stringify(address.trim()) +
    ', material.pbr().baseColor(' + JSON.stringify(materialColor) + ').roughness(0.45))' : '';
  return `import { scene, light, camera, material } from 'candela';
import { jigScene } from 'jig-candela';
import { program } from 'jig-program';
const asm = jigScene(program, { autoFinish: true })${override};
const v = asm.view('axo');
export default scene().add(asm)
  .add(light.sun().elevation(45).azimuth(135).illuminance(${illuminance}))
  .add(light.env.gradient({ top: "${top}", bottom: "${bottom}", intensity: 700 }))
  .camera(camera.pinhole().at(v.at).lookAt(v.target));
`;
}
