# Agent evaluation 2026-11-01T17-16-01

Cases: 2 · repeats: 3 · base: http://127.0.0.1:8787/ · compute: rust

| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |
|---|---|---|---|---|---|---|---|---|---|---|
| default | lunaroute/glm-5.3-flash | 6/6 | 100 % (61 %–100 %) | 7.7 | 8.7 | 164,701 | 96 % | 1,130 | 15.4 | ok 6 |
| complex | lunaroute/deepseek-4.1-flash | 6/6 | 100 % (61 %–100 %) | 10.0 | 10.7 | 229,652 | 97 % | 3,726 | 98.1 | ok 6 |

| Case | Tags | default: passed · tools · failing checks | complex: passed · tools · failing checks |
|---|---|---|---|
| w01-a01-hole-misses | repair, diagnostics, warnings | 3/3 · 6.0 · — | 3/3 · 7.0 · — |
| w02-a01-engrave-negative | edit, text, diagnostics, warnings | 3/3 · 9.3 · — | 3/3 · 13.0 · — |
