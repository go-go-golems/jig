# Agent evaluation 2026-11-01T04-59-02

Cases: 4 · repeats: 1 · base: http://127.0.0.1:8787/ · compute: rust

| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |
|---|---|---|---|---|---|---|---|---|---|---|
| complex | lunaroute/deepseek-4.1-flash | 4/4 | 100 % (51 %–100 %) | 6.8 | 7.8 | 162,734 | 98 % | 2,173 | 70.6 | ok 3, rate_limited 1 |

| Case | Tags | complex: passed · tools · failing checks |
|---|---|---|
| a01-readonly-refuse | read-only, edit | 1/1 · 4.0 · — |
| m07-wheel-30 | edit, assembly, gears, multi-feature | 1/1 · 12.0 · — |
| h04-switch-toggle | edit, configs | 1/1 · 4.0 · — |
| a01-undo-change | edit, multi-turn | 1/1 · 7.0 · — |
