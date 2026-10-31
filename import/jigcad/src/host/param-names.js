// Param names in lab: links. Multi-part programs (assemblies, print jobs) name params '<item>.<param>', where
// <item> is the component or job item id; rows also carry partName (the part's own name) and local (the bare
// param name). A link may give the full name, a plain name when only one part has it, or '<part name>.<param>'.
// → { name } (the program's full name) or { error }.
export function resolveParamName(params, name) {
  const rows = params ?? [];
  if (rows.some(r => r.name === name)) return { name };
  const local = r => r.local ?? (r.part && r.name.startsWith(r.part + '.') ? r.name.slice(r.part.length + 1) : r.name);
  const dot = name.indexOf('.');
  let hits = rows.filter(r => local(r) === name && !r.name.startsWith('gap.'));
  if (!hits.length && dot > 0) hits = rows.filter(r => (r.partName ?? r.part) === name.slice(0, dot) && local(r) === name.slice(dot + 1));
  if (hits.length > 1) return { error: `param ${name} is ambiguous: ${hits.map(r => r.name).join(', ')}` };
  if (!hits.length) return { error: `no param ${name}` };
  return { name: hits[0].name };
}
