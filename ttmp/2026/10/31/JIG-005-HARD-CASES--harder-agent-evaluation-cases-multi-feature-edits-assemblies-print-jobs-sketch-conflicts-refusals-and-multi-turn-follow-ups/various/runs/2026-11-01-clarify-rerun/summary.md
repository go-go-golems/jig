# Agent evaluation 2026-11-01T04-55-55

Cases: 1 · repeats: 3 · base: http://127.0.0.1:8787/ · compute: rust

| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |
|---|---|---|---|---|---|---|---|---|---|---|
| default | lunaroute/glm-5.3-flash | 2/3 | 67 % (21 %–94 %) | 5.0 | 7.0 | 126,184 | 89 % | 662 | 17.1 | ok 3 |
| complex | lunaroute/deepseek-4.1-flash | 3/3 | 100 % (44 %–100 %) | 3.0 | 4.7 | 89,995 | 98 % | 1,131 | 44.9 | ok 3 |

| Case | Tags | default: passed · tools · failing checks | complex: passed · tools · failing checks |
|---|---|---|---|
| a01-bigger-clarify | edit, multi-turn, clarify | 2/3 · 5.0 · metric×2 | 3/3 · 3.0 · — |
