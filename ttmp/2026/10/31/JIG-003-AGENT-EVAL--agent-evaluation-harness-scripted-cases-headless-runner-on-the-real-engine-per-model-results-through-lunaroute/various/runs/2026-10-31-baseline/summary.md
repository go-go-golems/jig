# Agent evaluation 2026-11-01T02-10-01

Cases: 14 · repeats: 3 · base: http://127.0.0.1:8787/ · compute: rust

| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |
|---|---|---|---|---|---|---|---|---|---|---|
| default | lunaroute/glm-5.3-flash | 42/42 | 100 % (92 %–100 %) | 3.6 | 4.6 | 84,593 | 98 % | 638 | 5.3 | ok 42 |
| complex | lunaroute/deepseek-4.1-flash | 42/42 | 100 % (92 %–100 %) | 5.0 | 5.5 | 114,314 | 96 % | 1,554 | 12.5 | ok 42 |

| Case | Tags | default: passed · tools · failing checks | complex: passed · tools · failing checks |
|---|---|---|---|
| a01-wall-edit | edit, params | 3/3 · 3.3 · — | 3/3 · 2.3 · — |
| a01-height-edit | edit, params | 3/3 · 3.3 · — | 3/3 · 2.0 · — |
| a01-footprint | edit, params | 3/3 · 4.3 · — | 3/3 · 2.7 · — |
| a01-name-why | question, naming | 3/3 · 2.3 · — | 3/3 · 10.7 · — |
| a01-volume-readonly | question, read-only | 3/3 · 1.0 · — | 3/3 · 1.0 · — |
| a01-readonly-refuse | read-only, edit | 3/3 · 4.0 · — | 3/3 · 3.7 · — |
| a01-whatif-mass | what-if, question | 3/3 · 1.7 · — | 3/3 · 3.7 · — |
| a01-wall3-fails | what-if, diagnostics | 3/3 · 5.3 · — | 3/3 · 6.0 · — |
| a01-fix-bug | repair, diagnostics | 3/3 · 2.7 · — | 3/3 · 4.0 · — |
| a01-fillet-too-large | edit, diagnostics | 3/3 · 6.7 · — | 3/3 · 10.3 · — |
| a01-ask-wall | edit, ask | 3/3 · 3.7 · — | 3/3 · 5.0 · — |
| a03-dof-question | question, sketch | 3/3 · 3.0 · — | 3/3 · 2.3 · — |
| a03-fix-dof | edit, sketch | 3/3 · 8.0 · — | 3/3 · 12.0 · — |
| s01-orientation | question, print | 3/3 · 1.3 · — | 3/3 · 4.7 · — |
