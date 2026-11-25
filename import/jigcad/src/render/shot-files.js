// Stage authoring data travels with the preset and its editable project copies.
export const CAMERAS_FILE = 'cameras.json';
export const SHOTS_FILE = 'shots.json';

export function namedEntries(files, file) {
  const text = files.get(file);
  if (text === undefined) return {};
  let entries;
  try { entries = JSON.parse(text); }
  catch (e) { throw Error(file + ': ' + e.message); }
  if (!entries || Array.isArray(entries) || typeof entries !== 'object')
    throw Error(file + ' must contain a JSON object keyed by name');
  return entries;
}

export function writeEntry(host, file, name, value) {
  const entries = namedEntries(host.files, file);
  if (!name.trim()) throw Error('Enter a name');
  if (value === undefined) delete entries[name];
  else Object.defineProperty(entries, name, {value, enumerable:true, configurable:true});
  host.setFile(file, JSON.stringify(entries, null, 2) + '\n');
}
