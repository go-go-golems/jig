# Agent evaluation 2026-11-01T05-06-02

Cases: 3 · repeats: 3 · base: http://127.0.0.1:8788/ · compute: rust

| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |
|---|---|---|---|---|---|---|---|---|---|---|
| default | lunaroute/glm-5.3-flash | 8/9 | 89 % (56 %–98 %) | 3.1 | 3.9 | 73,291 | 91 % | 578 | 15.9 | ok 9 |
| complex | lunaroute/deepseek-4.1-flash | 9/9 | 100 % (70 %–100 %) | 7.4 | 7.8 | 166,239 | 95 % | 4,093 | 56.7 | ok 9 |

| Case | Tags | default: passed · tools · failing checks | complex: passed · tools · failing checks |
|---|---|---|---|
| v01-s01-describe | visual, question, look | 3/3 · 2.0 · — | 3/3 · 7.3 · — |
| v02-a01-engrave-front | visual, edit, text, look | 2/3 · 3.7 · metric×1 | 3/3 · 10.0 · — |
| v03-a01-footprint-drawing | visual, edit, image | 3/3 · 3.7 · — | 3/3 · 5.0 · — |
