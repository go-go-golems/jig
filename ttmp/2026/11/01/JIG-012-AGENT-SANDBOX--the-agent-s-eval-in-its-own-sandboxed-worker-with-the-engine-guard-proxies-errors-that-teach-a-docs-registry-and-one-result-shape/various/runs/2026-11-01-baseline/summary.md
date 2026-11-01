# Agent evaluation 2026-11-01T22-22-30

Cases: 33 · repeats: 1 · base: http://127.0.0.1:8787/ · compute: rust

| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |
|---|---|---|---|---|---|---|---|---|---|---|
| default | lunaroute/glm-5.3-flash | 31/33 | 94 % (80 %–98 %) | 5.4 | 6.4 | 125,845 | 92 % | 1,178 | 21.4 | ok 33 |
| complex | lunaroute/deepseek-4.1-flash | 33/33 | 100 % (90 %–100 %) | 5.6 | 6.5 | 139,891 | 92 % | 2,137 | 16.3 | ok 33 |

| Case | Tags | default: passed · tools · failing checks | complex: passed · tools · failing checks |
|---|---|---|---|
| a01-wall-edit | edit, params | 1/1 · 2.0 · — | 1/1 · 3.0 · — |
| a01-height-edit | edit, params | 1/1 · 3.0 · — | 1/1 · 2.0 · — |
| a01-footprint | edit, params | 1/1 · 2.0 · — | 1/1 · 3.0 · — |
| a01-name-why | question, naming | 1/1 · 3.0 · — | 1/1 · 3.0 · — |
| a01-volume-readonly | question, read-only | 1/1 · 1.0 · — | 1/1 · 1.0 · — |
| a01-readonly-refuse | read-only, edit | 1/1 · 2.0 · — | 1/1 · 3.0 · — |
| a01-whatif-mass | what-if, question | 1/1 · 1.0 · — | 1/1 · 2.0 · — |
| a01-wall3-fails | what-if, diagnostics | 1/1 · 4.0 · — | 1/1 · 4.0 · — |
| a01-fix-bug | repair, diagnostics | 1/1 · 2.0 · — | 1/1 · 3.0 · — |
| a01-fillet-too-large | edit, diagnostics | 0/1 · 15.0 · compiles×1 | 1/1 · 8.0 · — |
| a01-ask-wall | edit, ask | 1/1 · 4.0 · — | 1/1 · 3.0 · — |
| a03-dof-question | question, sketch | 1/1 · 2.0 · — | 1/1 · 3.0 · — |
| a03-fix-dof | edit, sketch | 1/1 · 5.0 · — | 1/1 · 6.0 · — |
| s01-orientation | question, print | 1/1 · 1.0 · — | 1/1 · 6.0 · — |
| m07-ratio-centre | question, assembly, gears | 1/1 · 15.0 · — | 1/1 · 9.0 · — |
| m07-wheel-30 | edit, assembly, gears, multi-feature | 1/1 · 9.0 · — | 1/1 · 16.0 · — |
| m07-tooth-gap | question, assembly, gears | 1/1 · 14.0 · — | 1/1 · 3.0 · — |
| m09-travel-per-turn | question, assembly, gears | 1/1 · 2.0 · — | 1/1 · 4.0 · — |
| m08-hinge-clearance | question, assembly, fit | 1/1 · 2.0 · — | 1/1 · 5.0 · — |
| h04-decora-size | question, configs, units | 1/1 · 5.0 · — | 1/1 · 3.0 · — |
| h04-switch-toggle | edit, configs | 1/1 · 5.0 · — | 1/1 · 15.0 · — |
| h01-large | edit, configs, multi-feature, print | 1/1 · 13.0 · — | 1/1 · 12.0 · — |
| a01-mount-holes | edit, multi-feature, holes | 0/1 · 9.0 · metric×1 | 1/1 · 4.0 · — |
| a01-engrave | edit, multi-feature, text | 1/1 · 7.0 · — | 1/1 · 9.0 · — |
| a03-conflict | repair, sketch, diagnostics | 1/1 · 3.0 · — | 1/1 · 4.0 · — |
| a01-no-holes | refusal, question | 1/1 · 3.0 · — | 1/1 · 2.0 · — |
| a01-undo-change | edit, multi-turn | 1/1 · 10.0 · — | 1/1 · 8.0 · — |
| a01-bigger-clarify | edit, multi-turn, clarify | 1/1 · 5.0 · — | 1/1 · 4.0 · — |
| v01-s01-describe | visual, question, look | 1/1 · 1.0 · — | 1/1 · 3.0 · — |
| v02-a01-engrave-front | visual, edit, text, look | 1/1 · 4.0 · — | 1/1 · 12.0 · — |
| v03-a01-footprint-drawing | visual, edit, image | 1/1 · 5.0 · — | 1/1 · 7.0 · — |
| w01-a01-hole-misses | repair, diagnostics, warnings | 1/1 · 7.0 · — | 1/1 · 7.0 · — |
| w02-a01-engrave-negative | edit, text, diagnostics, warnings | 1/1 · 11.0 · — | 1/1 · 7.0 · — |
