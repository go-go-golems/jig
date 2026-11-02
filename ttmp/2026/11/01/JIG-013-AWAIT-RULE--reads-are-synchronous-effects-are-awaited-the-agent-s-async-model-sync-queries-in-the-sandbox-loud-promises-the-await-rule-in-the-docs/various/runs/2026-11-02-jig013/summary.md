# Agent evaluation 2026-11-02T00-02-04

Cases: 35 · repeats: 2 · base: http://127.0.0.1:8787/ · compute: rust

| Tier | Model | Passed | Pass rate (95 % CI) | Tools | Rounds | Input tok | Cached | Output tok | Seconds | Outcomes |
|---|---|---|---|---|---|---|---|---|---|---|
| default | lunaroute/glm-5.3-flash | 68/70 | 97 % (90 %–99 %) | 4.3 | 5.2 | 106,938 | 94 % | 1,060 | 11.9 | ok 70 |
| complex | lunaroute/deepseek-4.1-flash | 68/70 | 97 % (90 %–99 %) | 6.8 | 7.4 | 175,198 | 95 % | 3,271 | 31.7 | ok 70 |

| Case | Tags | default: passed · tools · failing checks | complex: passed · tools · failing checks |
|---|---|---|---|
| a01-wall-edit | edit, params | 2/2 · 3.0 · — | 2/2 · 4.0 · — |
| a01-height-edit | edit, params | 2/2 · 3.0 · — | 2/2 · 3.0 · — |
| a01-footprint | edit, params | 2/2 · 4.0 · — | 2/2 · 2.5 · — |
| a01-name-why | question, naming | 2/2 · 2.0 · — | 2/2 · 5.5 · — |
| a01-volume-readonly | question, read-only | 2/2 · 1.0 · — | 2/2 · 1.5 · — |
| a01-readonly-refuse | read-only, edit | 2/2 · 2.5 · — | 2/2 · 3.5 · — |
| a01-whatif-mass | what-if, question | 2/2 · 1.0 · — | 2/2 · 1.0 · — |
| a01-wall3-fails | what-if, diagnostics | 2/2 · 3.5 · — | 2/2 · 4.5 · — |
| a01-fix-bug | repair, diagnostics | 2/2 · 2.0 · — | 2/2 · 4.0 · — |
| a01-fillet-too-large | edit, diagnostics | 1/2 · 7.0 · compiles×1 | 2/2 · 11.5 · — |
| a01-ask-wall | edit, ask | 2/2 · 1.0 · — | 2/2 · 3.0 · — |
| a03-dof-question | question, sketch | 2/2 · 1.0 · — | 2/2 · 4.0 · — |
| a03-fix-dof | edit, sketch | 2/2 · 4.0 · — | 2/2 · 7.0 · — |
| s01-orientation | question, print | 2/2 · 1.5 · — | 2/2 · 7.5 · — |
| m07-ratio-centre | question, assembly, gears | 2/2 · 2.5 · — | 2/2 · 3.5 · — |
| m07-wheel-30 | edit, assembly, gears, multi-feature | 2/2 · 2.5 · — | 2/2 · 8.5 · — |
| m07-tooth-gap | question, assembly, gears | 2/2 · 9.5 · — | 2/2 · 8.5 · — |
| m09-travel-per-turn | question, assembly, gears | 2/2 · 1.5 · — | 2/2 · 5.5 · — |
| m08-hinge-clearance | question, assembly, fit | 2/2 · 2.0 · — | 2/2 · 7.0 · — |
| h04-decora-size | question, configs, units | 2/2 · 4.0 · — | 2/2 · 3.0 · — |
| h04-switch-toggle | edit, configs | 2/2 · 3.0 · — | 1/2 · 12.0 · metric×1 |
| h01-large | edit, configs, multi-feature, print | 2/2 · 8.0 · — | 2/2 · 15.0 · — |
| a01-mount-holes | edit, multi-feature, holes | 1/2 · 4.0 · metric×1 | 2/2 · 11.0 · — |
| a01-engrave | edit, multi-feature, text | 2/2 · 7.5 · — | 2/2 · 11.5 · — |
| a03-conflict | repair, sketch, diagnostics | 2/2 · 4.5 · — | 2/2 · 5.0 · — |
| a01-no-holes | refusal, question | 2/2 · 2.5 · — | 2/2 · 4.0 · — |
| a01-undo-change | edit, multi-turn | 2/2 · 5.0 · — | 2/2 · 6.5 · — |
| a01-bigger-clarify | edit, multi-turn, clarify | 2/2 · 7.0 · — | 2/2 · 6.0 · — |
| v01-s01-describe | visual, question, look | 2/2 · 2.5 · — | 2/2 · 5.0 · — |
| v02-a01-engrave-front | visual, edit, text, look | 2/2 · 7.5 · — | 2/2 · 13.5 · — |
| v03-a01-footprint-drawing | visual, edit, image | 2/2 · 5.0 · — | 2/2 · 5.0 · — |
| w01-a01-hole-misses | repair, diagnostics, warnings | 2/2 · 5.5 · — | 2/2 · 5.5 · — |
| w02-a01-engrave-negative | edit, text, diagnostics, warnings | 2/2 · 6.0 · — | 2/2 · 7.5 · — |
| a01-magnet-pocket | edit, library, fit | 2/2 · 7.5 · — | 2/2 · 15.0 · — |
| u01-cat-magnet-pin | create, preset, library, fit | 2/2 · 15.0 · — | 1/2 · 17.0 · metric×2 file×1 |
