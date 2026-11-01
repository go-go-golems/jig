# Agent evaluation 2026-11-01T17-01-13

Cases: 2 · repeats: 3 · base: http://127.0.0.1:8787/ · compute: rust

| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |
|---|---|---|---|---|---|---|---|---|---|---|
| default | lunaroute/glm-5.3-flash | 4/6 | 67 % (30 %–90 %) | 9.2 | 10.2 | 197,510 | 93 % | 1,827 | 32.7 | ok 6 |
| complex | lunaroute/deepseek-4.1-flash | 5/6 | 83 % (44 %–97 %) | 10.0 | 11.0 | 234,671 | 95 % | 3,580 | 115.1 | ok 6 |

| Case | Tags | default: passed · tools · failing checks | complex: passed · tools · failing checks |
|---|---|---|---|
| w01-a01-hole-misses | repair, diagnostics, warnings | 3/3 · 3.3 · — | 3/3 · 5.3 · — |
| w02-a01-engrave-negative | edit, text, diagnostics, warnings | 1/3 · 15.0 · metric×3 | 2/3 · 14.7 · file×1 metric×1 |
