// A camera shot uses presentation seconds. The solve still uses its own drive
// coordinate (degrees or mm). Only these serializable channels leave the worker.
const initial = { surface: 0, edges: 1, annotations: 1, isolate: null, section: null };
const levels = ['surface', 'edges', 'annotations'];

function components(ids, path) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id.trim()))
    throw Error(path + ' must list one or more component IDs');
  return [...new Set(ids)];
}

function section(spec, path) {
  if (spec === null) return null;
  if (!spec || typeof spec !== 'object' || Object.keys(spec).some(k => !['components', 'normal', 'offset'].includes(k)))
    throw Error(path + ' must be null or {components, normal, offset}');
  const { normal, offset } = spec;
  if (!Array.isArray(normal) || normal.length !== 3 || !normal.every(Number.isFinite))
    throw Error(path + '.normal must be a finite three-vector');
  const length = Math.hypot(...normal);
  if (!length || !Number.isFinite(length) || !Number.isFinite(offset))
    throw Error(path + ' needs a nonzero normal and a finite offset in mm');
  return { components: components(spec.components, path + '.components'), normal: normal.map(n => n / length), offset };
}

function color(value, path) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
    throw Error(path + ' must be a six-digit hex color');
  return value;
}

function accent(value, path) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Object.keys(value).some(k => !['components', 'color', 'opacity'].includes(k)))
    throw Error(path + ' must be null or {components, color, opacity?}');
  const opacity = value.opacity ?? 0.45;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    throw Error(path + '.opacity must be in [0, 1]');
  return { components: components(value.components, path + '.components'), color: color(value.color, path + '.color'), opacity };
}

function trail(value, path) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Object.keys(value).some(k => !['component', 'point', 'color', 'seconds'].includes(k)))
    throw Error(path + ' must be null or {component, point, color, seconds}');
  if (typeof value.component !== 'string' || !value.component.trim()) throw Error(path + '.component needs an occurrence ID');
  if (!Array.isArray(value.point) || value.point.length !== 3 || !value.point.every(Number.isFinite))
    throw Error(path + '.point must be a local XYZ point in mm');
  if (!Number.isFinite(value.seconds) || value.seconds <= 0) throw Error(path + '.seconds must be finite and positive');
  return { component: value.component, point: [...value.point], seconds: value.seconds, color: color(value.color, path + '.color') };
}

function view(value, path) {
  if (['stage', 'turntable', 'front-side'].includes(value)) return value;
  if (value && typeof value.inset === 'string' && value.inset.trim() && Object.keys(value).length === 1)
    return { inset: value.inset };
  throw Error(path + ' must be stage, turntable, front-side or {inset: component}');
}

export function shotComponents(key) {
  const ids = [...(key.isolate ?? []), ...(key.section?.components ?? []), ...(key.accent?.components ?? [])];
  if (key.trail) ids.push(key.trail.component);
  if (key.view?.inset) ids.push(key.view.inset);
  return ids;
}

export function normalizeShot(keys, studyName) {
  const path = 'study ' + studyName + '.shot';
  if (!Array.isArray(keys) || !keys.length) throw Error(path + ' must be a nonempty array of keyframes');
  let previous = -1;
  return keys.map((raw, i) => {
    const at = path + '[' + i + ']';
    if (!raw || !Number.isFinite(raw.time) || raw.time < 0 || raw.time <= previous)
      throw Error(at + '.time must be finite, nonnegative and strictly increasing (seconds)');
    previous = raw.time;
    const key = { time: raw.time };
    for (const [name, value] of Object.entries(raw)) {
      if (name === 'time') continue;
      if (levels.includes(name)) {
        if (!Number.isFinite(value) || value < 0 || value > 1) throw Error(at + '.' + name + ' must be in [0, 1]');
        key[name] = value;
      } else if (name === 'isolate') key.isolate = value === null ? null : components(value, at + '.isolate');
      else if (name === 'section') key.section = section(value, at + '.section');
      else if (name === 'accent') key.accent = accent(value, at + '.accent');
      else if (name === 'trail') key.trail = trail(value, at + '.trail');
      else if (name === 'view') key.view = view(value, at + '.view');
      else throw Error(at + ': unknown channel ' + name);
    }
    if (Object.keys(key).length === 1) throw Error(at + ' must specify a channel');
    return key;
  });
}

// Called when attaching a child's study to its parent assembly. A rigid or
// flexible child uses the same occurrence names as the resulting pose track.
export function mapShotComponents(keys, map) {
  return keys.map(key => ({
    ...key,
    ...(key.isolate && { isolate: key.isolate.map(map) }),
    ...(key.accent && { accent: { ...key.accent, components: key.accent.components.map(map) } }),
    ...(key.trail && { trail: { ...key.trail, component: map(key.trail.component) } }),
    ...(key.view?.inset && { view: { inset: map(key.view.inset) } }),
    ...(key.section && { section: { ...key.section, components: key.section.components.map(map) } }),
  }));
}

export function shotAt(keys, seconds) {
  const t = Math.max(0, seconds);
  const out = { ...initial };
  if (!keys) return out;
  for (const channel of levels) {
    let fromTime = 0;
    for (const key of keys) {
      if (!(channel in key)) continue;
      if (key.time > t) {
        const fraction = (t - fromTime) / (key.time - fromTime);
        out[channel] += fraction * (key[channel] - out[channel]);
        break;
      }
      fromTime = key.time;
      out[channel] = key[channel];
    }
  }
  for (const key of keys) {
    if (key.time > t) break;
    if ('isolate' in key) out.isolate = key.isolate;
    if ('section' in key) out.section = key.section;
    for (const name of ['accent', 'trail', 'view']) {
      if (!(name in key)) continue;
      if (key[name] == null) delete out[name];
      else out[name] = key[name];
    }
  }
  return out;
}
