# Agent evaluation 2026-11-01T03-11-58

Cases: 28 · repeats: 3 · base: http://127.0.0.1:8787/ · compute: rust

| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |
|---|---|---|---|---|---|---|---|---|---|---|
| default | lunaroute/glm-5.3-flash | 77/84 | 92 % (84 %–96 %) | 4.4 | 5.5 | 102,895 | 95 % | 905 | 16.6 | ok 84 |
| complex | lunaroute/deepseek-4.1-flash | 77/84 | 92 % (84 %–96 %) | 6.1 | 6.8 | 144,915 | 96 % | 2,383 | 56.5 | ok 78, rate_limited 6 |

| Case | Tags | default: passed · tools · failing checks | complex: passed · tools · failing checks |
|---|---|---|---|
| a01-wall-edit | edit, params | 3/3 · 3.0 · — | 3/3 · 2.3 · — |
| a01-height-edit | edit, params | 3/3 · 3.3 · — | 3/3 · 2.3 · — |
| a01-footprint | edit, params | 3/3 · 2.7 · — | 3/3 · 2.7 · — |
| a01-name-why | question, naming | 3/3 · 2.0 · — | 3/3 · 7.3 · — |
| a01-volume-readonly | question, read-only | 3/3 · 1.0 · — | 3/3 · 1.0 · — |
| a01-readonly-refuse | read-only, edit | 3/3 · 4.0 · — | 2/3 · 4.0 · answer×2 |
| a01-whatif-mass | what-if, question | 3/3 · 1.3 · — | 3/3 · 2.0 · — |
| a01-wall3-fails | what-if, diagnostics | 3/3 · 4.0 · — | 3/3 · 8.3 · — |
| a01-fix-bug | repair, diagnostics | 3/3 · 4.0 · — | 3/3 · 3.7 · — |
| a01-fillet-too-large | edit, diagnostics | 3/3 · 6.3 · — | 3/3 · 8.7 · — |
| a01-ask-wall | edit, ask | 3/3 · 4.3 · — | 3/3 · 2.3 · — |
| a03-dof-question | question, sketch | 2/3 · 2.0 · answer×1 | 3/3 · 3.0 · — |
| a03-fix-dof | edit, sketch | 3/3 · 5.0 · — | 3/3 · 10.0 · — |
| s01-orientation | question, print | 3/3 · 1.7 · — | 3/3 · 5.7 · — |
| m07-ratio-centre | question, assembly, gears | 3/3 · 5.3 · — | 3/3 · 10.7 · — |
| m07-wheel-30 | edit, assembly, gears, multi-feature | 3/3 · 10.7 · — | 2/3 · 11.3 · answer×1 |
| m07-tooth-gap | question, assembly, gears | 3/3 · 15.0 · — | 3/3 · 9.3 · — |
| m09-travel-per-turn | question, assembly, gears | 1/3 · 1.3 · answer×2 | 3/3 · 7.3 · — |
| m08-hinge-clearance | question, assembly, fit | 3/3 · 2.0 · — | 3/3 · 6.7 · — |
| h04-decora-size | question, configs, units | 3/3 · 2.3 · — | 3/3 · 2.3 · — |
| h04-switch-toggle | edit, configs | 3/3 · 3.3 · — | 2/3 · 5.3 · file×1 metric×2 |
| h01-large | edit, configs, multi-feature, print | 2/3 · 6.7 · file×1 metric×1 | 3/3 · 11.7 · — |
| a01-mount-holes | edit, multi-feature, holes | 3/3 · 5.7 · — | 3/3 · 4.0 · — |
| a01-engrave | edit, multi-feature, text | 3/3 · 8.7 · — | 3/3 · 13.0 · — |
| a03-conflict | repair, sketch, diagnostics | 3/3 · 5.0 · — | 3/3 · 7.3 · — |
| a01-no-holes | refusal, question | 3/3 · 2.7 · — | 3/3 · 5.7 · — |
| a01-undo-change | edit, multi-turn | 3/3 · 5.0 · — | 2/3 · 5.7 · param×2 metric×1 |
| a01-bigger-clarify | edit, multi-turn, clarify | 0/3 · 6.0 · metric×6 | 0/3 · 7.3 · metric×6 |
