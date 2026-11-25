import { normalizeShot, shotComponents } from './shot.js';
import { CAMERAS_FILE, SHOTS_FILE, namedEntries } from './shot-files.js';

export function validateTimeline(keys, study, files, components) {
  const sorted = [...keys].sort((a,b) => a.time-b.time);
  const result = normalizeShot(sorted, study.name);
  if (result.at(-1).time > study.seconds) throw Error('Key extends beyond the study');
  const cameras = namedEntries(files, CAMERAS_FILE);
  const ids = new Set(components.map(c => c.id));
  for (const key of result) {
    for (const id of shotComponents(key)) if (!ids.has(id)) throw Error('Unknown component: ' + id);
    if (key.view?.camera && !Object.hasOwn(cameras,key.view.camera)) throw Error('Unknown saved camera: ' + key.view.camera);
  }
  return result;
}

export function projectShot(study, files, components) {
  const shots = namedEntries(files, SHOTS_FILE);
  if (!Object.hasOwn(shots,study.name)) return study.shot;
  return validateTimeline(shots[study.name],study,files,components);
}
