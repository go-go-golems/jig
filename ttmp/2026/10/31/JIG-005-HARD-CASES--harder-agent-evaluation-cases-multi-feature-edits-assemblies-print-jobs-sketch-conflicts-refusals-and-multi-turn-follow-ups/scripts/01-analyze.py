#!/usr/bin/env python3
"""JIG-005 analysis: merge the baseline (rescored) with reruns, then report the first and the harder set per tier.

usage: python3 01-analyze.py BASELINE.rescored.jsonl [--replace RUN.jsonl ...]
A replacement record takes the place of baseline records with the same (tier, case): a whole case when the rerun
has all its repeats (a corrected case), or one rate-limited record per replacement otherwise.
"""
import json, math, sys, statistics as st
from collections import defaultdict

def wilson(k, n, z=1.96):
    if n == 0: return (0, 0)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0, c - h), min(1, c + h))

args = sys.argv[1:]
base = [json.loads(l) for l in open(args[0])]
reps = []
if '--replace' in args:
    for f in args[args.index('--replace') + 1:]: reps += [json.loads(l) for l in open(f)]
by = defaultdict(list)
for r in reps: by[(r['tier'], r['case'])].append(r)
out = []
for key, rs in by.items():
    n_base = sum(1 for r in base if (r['tier'], r['case']) == key)
    if len(rs) >= n_base:                       # a corrected case: all its records replaced
        base = [r for r in base if (r['tier'], r['case']) != key]; out += rs
    else:                                       # rate-limited records replaced one for one
        for rep in rs:
            i = next(i for i, r in enumerate(base) if (r['tier'], r['case']) == key and r['outcome'] == 'rate_limited')
            base[i] = dict(rep, replaced=True)
recs = base + out
FIRST = {'a01-wall-edit','a01-height-edit','a01-footprint','a01-name-why','a01-volume-readonly','a01-readonly-refuse','a01-whatif-mass',
         'a01-wall3-fails','a01-fix-bug','a01-fillet-too-large','a01-ask-wall','a03-dof-question','a03-fix-dof','s01-orientation'}
for tier in ['default', 'complex']:
    for name, sel in [('first 14', lambda r: r['case'] in FIRST), ('harder 14', lambda r: r['case'] not in FIRST)]:
        R = [r for r in recs if r['tier'] == tier and sel(r)]
        k = sum(r['pass'] for r in R); lo, hi = wilson(k, len(R))
        tools = [r['toolCalls'] for r in R]; secs = [r['ms'] / 1000 for r in R]
        print(f"{tier:8} {name:10} {k}/{len(R)} = {100*k/len(R):.0f} % (CI {100*lo:.0f}–{100*hi:.0f} %)  tools mean {st.mean(tools):.1f} max {max(tools)}  "
              f"sec median {st.median(secs):.1f} max {max(secs):.1f}  outcomes {dict((o, sum(1 for r in R if r['outcome']==o)) for o in set(r['outcome'] for r in R))}")
print('\nfailures:')
for r in sorted(recs, key=lambda r: (r['tier'], r['case'], r['repeat'])):
    if not r['pass']: print(f"  {r['tier']:8} {r['case']:22} #{r['repeat']} {r['outcome']:12} {'; '.join(c['detail'] for c in r['checks'] if not c['pass'])[:160]}")
print('\nper harder case, mean tool calls (default | complex) and passes:')
for c in sorted(set(r['case'] for r in recs) - FIRST):
    row = []
    for tier in ['default', 'complex']:
        R = [r for r in recs if r['tier'] == tier and r['case'] == c]
        row.append(f"{sum(r['pass'] for r in R)}/{len(R)} · {st.mean(r['toolCalls'] for r in R):4.1f}")
    print(f"  {c:22} {row[0]:>10}   {row[1]:>10}")
