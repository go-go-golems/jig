#!/usr/bin/env python3
"""Compare two agent-eval runs (results.jsonl): per tier and per case.

    python3 scripts/01-compare.py BEFORE/results.jsonl AFTER/results.jsonl

"Unawaited" counts steps whose code calls an async lab function (faces, why, feature, sketch, check, run, edges)
neither awaited nor returned (a heuristic over the recorded code, cut at 400 characters). "Repeat after note"
counts unawaited steps that come after a step whose result already carried the Promise note in the same run.
"""
import json, re, statistics as st, sys

A = 'faces|why|feature|sketch|check|run|edges'
call = re.compile(r'(^|[^\w.])((?:await\s+|return\s+)?)(' + A + r')\(')
unawaited = lambda code: any(not m.group(2) for m in call.finditer(code))

def load(p): return [json.loads(l) for l in open(p)]

def stats(rs):
    steps = [s for r in rs for s in r['steps']]
    rep = 0
    for r in rs:
        noted = False
        for s in r['steps']:
            if noted and unawaited(s['code']): rep += 1
            if 'never awaited' in (s.get('result') or ''): noted = True
    u = [r['usage'] for r in rs if r.get('usage')]
    return {
        'runs': len(rs), 'passed': sum(r['pass'] for r in rs),
        'tools_mean': st.mean(r['toolCalls'] for r in rs), 'tools_max': max(r['toolCalls'] for r in rs),
        'rounds_mean': st.mean(x['rounds'] for x in u), 'rounds_max': max(x['rounds'] for x in u),
        'sec_median': st.median(r['ms'] / 1000 for r in rs), 'sec_mean': st.mean(r['ms'] / 1000 for r in rs), 'sec_max': max(r['ms'] / 1000 for r in rs),
        'output_mean': st.mean(x['output'] for x in u), 'uncached_mean': st.mean(x['input'] - x['cacheRead'] for x in u),
        'steps': len(steps), 'unawaited': sum(unawaited(s['code']) for s in steps),
        'noted_steps': sum('never awaited' in (s.get('result') or '') for s in steps), 'repeat_after_note': rep,
        'unhandled': sum(r.get('unhandledRejections', 0) for r in rs),
    }

a, b = load(sys.argv[1]), load(sys.argv[2])
for tier in sorted({r['tier'] for r in a + b}):
    x, y = stats([r for r in a if r['tier'] == tier]), stats([r for r in b if r['tier'] == tier])
    print(f'== {tier}')
    for k in x:
        fx, fy = x[k], y[k]
        f = (lambda v: f'{v:.2f}') if isinstance(fx, float) or isinstance(fy, float) else str
        print(f'  {k:18s} {f(fx):>10s} → {f(fy):>10s}')
print('\nper case, mean tool calls (default | complex): before → after')
for c in sorted({r['case'] for r in a}):
    row = []
    for tier in ['default', 'complex']:
        m = lambda rs: st.mean(r['toolCalls'] for r in rs if r['case'] == c and r['tier'] == tier) if any(r['case'] == c and r['tier'] == tier for r in rs) else float('nan')
        row.append(f'{m(a):5.1f} → {m(b):5.1f}')
    print(f'  {c:24s} {row[0]}   |   {row[1]}')
