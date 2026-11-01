#!/usr/bin/env python3
"""Analyse an agent-eval results.jsonl: per-tier medians, the longest runs, unhandled rejections, and steps that
call an async lab function (faces, why, feature, sketch, check, run, edges) without awaiting or returning it.
The last is a heuristic over step code as recorded (cut at 400 characters).

    python3 scripts/01-run-analysis.py various/runs/<run>/results.jsonl
"""
import json, re, statistics as st, sys

rs = [json.loads(l) for l in open(sys.argv[1])]
A = 'faces|why|feature|sketch|check|run|edges'
call = re.compile(r'(^|[^\w.])((?:await\s+|return\s+)?)(' + A + r')\(')
print(f"{len(rs)} runs, {sum(r['pass'] for r in rs)} passed")
for tier in sorted({r['tier'] for r in rs}):
    x = [r for r in rs if r['tier'] == tier]
    unc = [r['usage']['input'] - r['usage']['cacheRead'] for r in x if r.get('usage')]
    steps = [s for r in x for s in r['steps']]
    bad = [s for s in steps if any(not m.group(2) for m in call.finditer(s['code']))]
    print(f"{tier}: tools median {st.median(r['toolCalls'] for r in x)} max {max(r['toolCalls'] for r in x)}; "
          f"seconds median {st.median(r['ms'] / 1000 for r in x):.1f} max {max(r['ms'] / 1000 for r in x):.1f}; "
          f"uncached input median {st.median(unc)} max {max(unc)}; rounds max {max(r['usage']['rounds'] for r in x if r.get('usage'))}; "
          f"unawaited async calls in {len(bad)}/{len(steps)} steps ({len(bad) / max(1, len(steps)):.0%}); "
          f"unhandled rejections {sum(r.get('unhandledRejections', 0) for r in x)}")
for r in sorted(rs, key=lambda r: -r['toolCalls'])[:6]:
    print(f"  long: {r['tier']} #{r['repeat']} {r['case']}: {r['toolCalls']} tools, {r['usage']['rounds']} rounds, {r['ms'] / 1000:.1f} s")
