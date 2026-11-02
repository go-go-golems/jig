# Agent eval failures

Runs: 70 · steps: 434 · failed steps: 46 (11 %) · runs with a misuse error: 12 (17 %) · runs with a stuck loop (≥ 3 failures in a row): 0

| Class | Steps | Runs | Example |
|---|---:|---:|---|
| other error | 32 | 23 | `Error: read-only mode: files.edit is off (line 1)` |
| **not a function: .diagnostics** | 5 | 4 | `TypeError: pr.diagnostics is not a function (line 3)` |
| **not a function: .slice** | 1 | 1 | `TypeError: why(...)?.slice is not a function (line 2)` |
| **read of undefined: .params** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'params') (line 7)` |
| **read of undefined: .toFixed** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'toFixed') (line 2)` |
| **read of undefined: .faces** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'faces') (line 2)` |
| **not a function: .edges** | 1 | 1 | `TypeError: p.feature(...).edges is not a function (line 3)` |
| **guarded name: check().program.measure.edges** | 1 | 1 | `TypeError: check().program.measure.edges does not exist. Did you mean check().program.measure.edge? (check().program.measure has: angle, area, bbox, distance, e` |
| **not a function: .join** | 1 | 1 | `TypeError: files.read(...).join is not a function (line 1)` |
| **guarded name: j.fit.free** | 1 | 1 | `TypeError: j.fit.free does not exist. (j.fit has: calibrate, classes, coupon, gap, hole, pin, profile, profileRegister) help('j.fit') says what each does. (line` |
| **not a function: .filter** | 1 | 1 | `TypeError: files.read(...).filter is not a function (line 1)` |

Misuse classes are in bold.

Steps to recover after a failed step: 1: 36 · 2: 6 · never: 4

Scope names called (steps): files.read 163 · j. 144 · check 143 · run 58 · files.edit 52 · program.metrics 20 · files.list 18 · help 16 · faces 14 · look 13 · files.grep 11 · params.overrides 6 · program.sketch 5 · sketch 5 · params.set 5 · program.summary 3 · program.diagnostics 3 · program.params 3 · params.get 3 · params.clear 3 · program.decisions 2 · program.faces 2 · why 2 · view.set 2 · files.write 1 · program.why 1 · feature 1 · measure.face 1 · params.list 1

Never called: files.rename, files.remove, program.trace, program.graph, program.ir, program.bodies, program.print, program.feature, measure.edge, measure.distance, measure.angle, measure.bbox, measure.area, selection, select, view.get, exportFile, presets.list, presets.load, presets.current, presets.create, presets.rename, lab.
