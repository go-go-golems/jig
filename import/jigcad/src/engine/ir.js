// IR text dumps L0–L6 (README §5): each level answers one question, in plain readable text.
const f = (v, d = 2) => v == null ? '–' : typeof v === 'number' ? (+v.toFixed(d)).toLocaleString('en-GB') : String(v);
const short = h => h ? '#' + String(h).replace(/^h:/, '').slice(0, 4) : '';

// parts: [{ name, hash, part (builder), res (compilePart result), occurrence? }]
export function irText(P) {
  const L = {};
  const parts = P.parts;
  // L0: what was asked
  {
    const lines = [];
    if (P.job) lines.push(`print '${P.job.name}' ${short(P.hash)} · printer ${P.job.printer.name} · material ${P.job.material?.name ?? 'PLA (default)'} · fit '${P.fitName}'`);
    if (P.assembly) lines.push(`${P.job ? '└─ ' : ''}assembly '${P.assembly.name}' ${short(P.assembly.hash)}  components [${P.assembly.components.map(c => c.id).join(', ')}]`);
    for (const p of parts) {
      const params = (p.res.paramRows ?? []).map(r => `${r.name}: ${r.text ?? f(r.value)}`).join(', ');
      lines.push(`${P.job || P.assembly ? '   ├─ ' : ''}part '${p.name}' ${short(p.res.hash)}${params ? `  params { ${params} }` : ''}${p.part?.meta?.configs ? `  configs [${Object.keys(p.part.meta.configs.rows ?? p.part.meta.configs).join(', ')}]` : ''}`);
      for (const ft of p.res.features) lines.push(`${P.job || P.assembly ? '   │   ' : '  '}${ft.id.padEnd(12)} ${ft.type.padEnd(9)} ${short(ft.key)}${ft.auto ? '  (generated id)' : ''}${ft.line ? `  script.js:${ft.line}` : ''}`);
    }
    if (P.dataFiles?.length) lines.push(`data: ${P.dataFiles.map(d => `${d.name} ${short(d.hash)}`).join(' · ')}`);
    L.L0 = lines.join('\n');
  }
  // L1: feature graph
  {
    const lines = [];
    for (const p of parts) {
      const chain = p.res.features.map(ft => {
        const info = ft.info ?? {};
        const what = ft.type === 'extrude' ? `extrude ${info.extent ?? ''}` : ft.type === 'hole' ? `hole ${info.count ?? ''} × ${info.label ?? ''}` : ft.type;
        return `${ft.id}(${what.trim()})`;
      });
      const sk = [...p.res.sketches.keys()];
      lines.push(`${p.name}: ${sk.length ? sk.map(s => `${s}(sketch)`).join(', ') + ' → ' : ''}${chain.join(' → ')}`);
      for (const r of dedupeRefs(p.res.refs)) lines.push(`  ${r.at} ← j.feat('${r.id}')`);
      for (const port of p.part?.meta?.ports ?? []) lines.push(`  port ${port.name} ← ${String(port.frame)}`);
    }
    if (P.assembly) for (const jn of P.assembly.joints) lines.push(`${P.assembly.name}: ${jn.id} = ${jn.kind}(${jn.a}, ${jn.b})${jn.limits ? ` [${jn.limits.map(x => f(x * 180 / Math.PI, 1) + '°').join(', ')}]` : ''}`);
    if (P.job) lines.push(`job: orient(${P.job.orientSlotText}) ⇄ teardrops · supports(${P.job.supportsText}) · slice(${P.job.sliceText}) · plates(${P.job.packText})`);
    L.L1 = lines.join('\n');
  }
  // L2: values with provenance
  {
    const lines = [];
    for (const p of parts) for (const r of p.res.paramRows ?? []) lines.push(`${p.name}.${r.name} = ${r.text ?? f(r.value)}${r.expr ? `  = ${r.expr}` : ''} ← ${r.src}${r.deps?.length ? `  (deps: ${r.deps.join(', ')})` : ''}`);
    for (const g of P.fitRows ?? []) lines.push(`gap.${g.name} = ${f(g.value, 3)} mm ← ${g.src}`);
    if (P.printerCtx) lines.push(`lw = ${f(P.printerCtx.lw, 3)} mm · layer = ${f(P.printerCtx.layer, 3)} mm · nozzle = ${f(P.printerCtx.nozzle, 3)} mm ← ${P.job ? `printer ${P.job.printer.name}` : 'defaults (FDM 0.4 mm)'}`);
    L.L2 = lines.join('\n') || '(no parameters)';
  }
  // L3: sketches
  {
    const lines = [];
    for (const s of P.sketches) {
      const counts = {};
      for (const e of s.entities ?? []) if (!e.construction) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      const ent = Object.entries(counts).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ');
      lines.push(`${s.id}: ${ent || 'empty'}, ${s.n ?? '?'} → ${s.dof} DOF, ${s.status}${s.conflicts?.length ? ` · conflicts: ${s.conflicts.map(c => '{' + c.join(', ') + '}').join(' ')}` : ''}${s.redundant?.length ? ` · redundant: ${s.redundant.join(', ')}` : ''}`);
    }
    // then each sketch's own block (solver, clusters, iterations, unknowns per entity, equations per kind, rank,
    // solved coordinates, profiles), one block per sketch after a blank line: Program.ir(L3, { node }) picks one
    const blocks = P.sketches.filter(s => s.dump).map(s => s.dump);
    L.L3 = [lines.join('\n') || '(no sketches)', ...blocks].join('\n\n');
  }
  // L4: topology
  {
    const lines = [];
    for (const p of parts) for (const b of p.res.state.bodies) {
      const t = b.topology();
      lines.push(`${p.name}/${b.id}: ${b.nFaces} faces · ${t.E} edges · ${t.V} vertices · ${t.L} loops · Euler–Poincaré ${t.residual === 0 ? `${t.V} − ${t.E} + ${t.F} − (${t.L} − ${t.F}) − 2(${t.S} − ${t.G}) = 0 ✓` : `${t.V} − ${t.E} + ${t.F} − (${t.L} − ${t.F}) = ${t.V - t.E + t.F - (t.L - t.F)} gives genus ${t.G}, not a whole number ✗`} · volume ${f(b.volume(), 1)} mm³`);
      const names = b.names.map((n, i) => n + (b.aliases?.[i] ? ` (= ${b.aliases[i].join(', ')})` : ''));
      lines.push('  ' + names.join(' · '));
    }
    for (const d of P.decisions.filter(d => ['op', 'teardrop', 'fillet.order'].includes(d.kind))) lines.push(`decision ${d.at}: ${d.kind} → ${Array.isArray(d.chose) ? d.chose.join(', ') : d.chose} (${d.reason})`);
    L.L4 = lines.join('\n');
  }
  // L5: world
  {
    const lines = [];
    for (const o of P.occurrences ?? []) lines.push(`${o.id} @ ${o.txText}${o.ground ? ' (ground)' : ''}${o.joint ? ` · joint ${o.joint} = ${o.value}` : ''}`);
    if (P.print) {
      for (const [k, o] of Object.entries(P.print.orientation)) lines.push(`orient ${k}: ${o.dir} · support ${f(o.supportVolume, 0)} mm³ · bed contact ${f(o.bedContact, 0)} mm² · height ${f(o.height, 1)} mm (${o.reason})`);
      for (const pl of P.print.plates) lines.push(`plate ${pl.index}: ${pl.items.map(i => i.body).join(', ')}${pl.utilisation != null ? ` · utilisation ${f(pl.utilisation, 2)}` : ''}`);
    }
    if (!lines.length) lines.push(...parts.flatMap(p => p.res.state.bodies.map(b => `${p.name}/${b.id} @ identity`)));
    L.L5 = lines.join('\n');
  }
  // L6: products
  {
    const lines = [];
    for (const b of P.bodiesData ?? []) lines.push(`${b.id}: ${b.mesh ? b.mesh.indices.length / 3 : 0} triangles (deflection ${f(b.deflection, 3)} mm) · ${b.edges.length} edge polylines`);
    if (P.print?.layers) lines.push(`layers: ${P.print.layers.count} × ${f(P.print.layers.height, 2)} mm · cusp max ${f(P.print.layers.cuspMax, 3)} mm`);
    if (P.print) lines.push(`supports ≈ ${f(P.metricsFlat?.supportVolume ?? 0, 0)} mm³ · print time ≈ ${f(P.metricsFlat?.printTime ?? 0, 0)} min · filament ≈ ${f(P.metricsFlat?.filament ?? 0, 2)} m (${f(P.metricsFlat?.filamentMass ?? 0, 1)} g)`);
    L.L6 = lines.join('\n');
  }
  return L;
}
function dedupeRefs(refs) { const s = new Set(); return (refs ?? []).filter(r => { const k = r.at + r.id; if (s.has(k)) return false; s.add(k); return true; }); }
