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
  }
  return out;
}
