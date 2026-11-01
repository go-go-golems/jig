// Summaries of evaluation records (JIG-003 design doc §5.8): pass rates with 95 % Wilson intervals, means of tool
// calls, rounds, tokens and time per tier, and a per-case table.

/** Wilson score interval for k successes in n trials (z = 1.96 → 95 %). → { p, lo, hi } */
export function wilson(k, n, z = 1.96) {
  if (!n) return { p: 0, lo: 0, hi: 0 };
  const p = k / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z / (1 + z2 / n)) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarise(records) {
  const tiers = [...new Set(records.map(r => r.tier))];
  const byTier = tiers.map(tier => {
    const rs = records.filter(r => r.tier === tier);
    const k = rs.filter(r => r.pass).length;
    const used = rs.filter(r => r.usage);
    const inputs = used.map(r => r.usage.input);
    const cached = used.map(r => r.usage.cacheRead);
    return {
      tier, n: rs.length, passed: k, ...wilson(k, rs.length),
      model: used.find(r => r.usage.model)?.usage.model || null,
      toolCalls: mean(rs.map(r => r.toolCalls)), rounds: mean(used.map(r => r.usage.rounds)),
      input: mean(inputs), cachedShare: inputs.reduce((a, b) => a + b, 0) ? cached.reduce((a, b) => a + b, 0) / inputs.reduce((a, b) => a + b, 0) : null,
      output: mean(used.map(r => r.usage.output)), seconds: mean(rs.map(r => r.ms / 1000)),
      outcomes: rs.reduce((m, r) => ({ ...m, [r.outcome]: (m[r.outcome] || 0) + 1 }), {}),
    };
  });
  const cases = [...new Set(records.map(r => r.case))].map(id => ({
    id, tags: records.find(r => r.case === id).tags,
    byTier: Object.fromEntries(tiers.map(t => {
      const rs = records.filter(r => r.case === id && r.tier === t);
      const fails = {};
      for (const r of rs) for (const c of r.checks || []) if (!c.pass) fails[c.kind] = (fails[c.kind] || 0) + 1;
      if (rs.some(r => r.error)) fails.setup = rs.filter(r => r.error).length;
      return [t, { n: rs.length, passed: rs.filter(r => r.pass).length, fails, toolCalls: mean(rs.map(r => r.toolCalls)) }];
    })),
  }));
  return { tiers, byTier, cases };
}

const f0 = x => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
const f1 = x => (x == null ? '—' : x.toFixed(1));
const pc = x => (x == null ? '—' : `${Math.round(x * 100)} %`);

export function markdown(summary, meta = {}) {
  const L = [];
  L.push(`# Agent evaluation ${meta.stamp || ''}`.trim(), '');
  if (meta.note) L.push(meta.note, '');
  L.push(`Cases: ${summary.cases.length} · repeats: ${meta.repeat ?? '?'} · base: ${meta.base ?? '?'} · compute: ${meta.compute ?? '?'}`, '');
  L.push('| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of summary.byTier) {
    L.push(`| ${t.tier} | ${t.model || '—'} | ${t.passed}/${t.n} | ${pc(t.p)} (${pc(t.lo)}–${pc(t.hi)}) | ${f1(t.toolCalls)} | ${f1(t.rounds)} | ${f0(t.input)} | ${pc(t.cachedShare)} | ${f0(t.output)} | ${f1(t.seconds)} | ${Object.entries(t.outcomes).map(([k, v]) => `${k} ${v}`).join(', ')} |`);
  }
  L.push('', '| Case | Tags | ' + summary.tiers.map(t => `${t}: passed · tools · failing checks`).join(' | ') + ' |');
  L.push('|---|---|' + summary.tiers.map(() => '---|').join(''));
  for (const c of summary.cases) {
    L.push(`| ${c.id} | ${(c.tags || []).join(', ')} | ` + summary.tiers.map(t => {
      const x = c.byTier[t];
      const fails = Object.entries(x.fails).map(([k, v]) => `${k}×${v}`).join(' ');
      return `${x.passed}/${x.n} · ${f1(x.toolCalls)} · ${fails || '—'}`;
    }).join(' | ') + ' |');
  }
  return L.join('\n') + '\n';
}
