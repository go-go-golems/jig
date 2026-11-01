# Agent eval failures

Runs: 517 · steps: 2697 · failed steps: 444 (16 %) · runs with a misuse error: 136 (26 %) · runs with a stuck loop (≥ 3 failures in a row): 15

| Class | Steps | Runs | Example |
|---|---:|---:|---|
| promise not awaited | 198 | 174 | `TypeError: faces(...).map is not a function (line 1)` |
| other error | 159 | 114 | `Error: read-only mode: files.edit is off (line 1)` |
| **not defined: j** | 72 | 67 | `ReferenceError: j is not defined (line 1)` |
| **not defined: mm** | 39 | 39 | `ReferenceError: mm is not defined (line 1)` |
| **not a function: .map** | 39 | 35 | `TypeError: r.warnings?.map is not a function (line 3)` |
| **not a function: .filter** | 14 | 13 | `TypeError: f.filter is not a function (line 3)` |
| **not a function: .slice** | 12 | 12 | `TypeError: res.warnings?.slice is not a function (line 5)` |
| **read of undefined: .volume** | 9 | 9 | `TypeError: Cannot read properties of undefined (reading 'volume') (line 4)` |
| **read of undefined: .map** | 3 | 3 | `TypeError: Cannot read properties of undefined (reading 'map') (line 4)` |
| **not a function: .catch** | 3 | 3 | `TypeError: measure.distance(...).catch is not a function (line 3)` |
| **read of undefined: .toFixed** | 3 | 3 | `TypeError: Cannot read properties of undefined (reading 'toFixed') (line 2)` |
| syntax error | 3 | 3 | `SyntaxError: Unexpected reserved word` |
| **read of undefined: .filter** | 2 | 2 | `TypeError: Cannot read properties of undefined (reading 'filter') (line 3)` |
| **read of undefined: .height** | 2 | 1 | `TypeError: Cannot read properties of undefined (reading 'height') (line 11)` |
| **read of undefined: .5** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading '5') (line 3)` |
| **not defined: n0** | 1 | 1 | `ReferenceError: n0 is not defined (line 5)` |
| **not a function: .metric** | 1 | 1 | `TypeError: program.metric is not a function (line 1)` |
| **not defined: w3** | 1 | 1 | `ReferenceError: w3 is not defined (line 10)` |
| **read of undefined: .slice** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'slice') (line 3)` |
| **not a function: .split** | 1 | 1 | `TypeError: program.bodies(...)[0].faces.split is not a function (line 1)` |
| **not a function: .genealogy** | 1 | 1 | `TypeError: program.genealogy is not a function (line 1)` |
| **not defined: run_** | 1 | 1 | `ReferenceError: run_ is not defined` |
| **not defined: j_dummy** | 1 | 1 | `ReferenceError: j_dummy is not defined (line 3)` |
| **not defined: j2** | 1 | 1 | `ReferenceError: j2 is not defined (line 1)` |
| **not defined: window** | 1 | 1 | `ReferenceError: window is not defined (line 2)` |
| **not defined: mini** | 1 | 1 | `ReferenceError: mini is not defined (line 1)` |
| **not a function: .toFixed** | 1 | 1 | `TypeError: v.toFixed is not a function (line 5)` |
| **read of undefined: .bbox** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'bbox') (line 2)` |
| **not a function: .then** | 1 | 1 | `TypeError: files.list(...).then is not a function (line 1)` |
| **read of undefined: .plates** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'plates') (line 8)` |

Misuse classes are in bold.

Steps to recover after a failed step: 1: 325 · 2: 70 · 3: 14 · 4: 4 · 5: 1 · never: 30

Stuck loops: complex #2 a01-ask-wall (3); default #2 a01-name-why (3); default #1 a01-engrave (3); default #2 a01-fix-bug (3); default #2 a01-engrave (5); complex #2 h04-switch-toggle (3); complex #2 a01-engrave (4); default #1 m07-tooth-gap (3); default #1 a01-engrave (4); default #1 w02-a01-engrave-negative (3); default #2 w02-a01-engrave-negative (3); default #2 w02-a01-engrave-negative (3); default #3 w02-a01-engrave-negative (4); complex #1 w01-a01-hole-misses (3); complex #1 w02-a01-engrave-negative (3)

Scope names called (steps): files.read 992 · run 478 · check 403 · files.edit 401 · faces 386 · j. 363 · program.metrics 355 · sketch 178 · program.summary 139 · program.diagnostics 135 · files.grep 118 · program.params 108 · files.list 88 · program.bodies 80 · look 80 · why 64 · program.decisions 54 · params.overrides 44 · params.set 43 · params.get 38 · feature 37 · program.print 36 · measure.face 33 · measure.bbox 33 · program.ir 29 · params.list 28 · params.clear 26 · measure.distance 21 · program.graph 14 · lab. 14 · files.write 5 · view.get 5 · program.trace 3 · view.set 3 · exportFile 2 · measure.area 1 · select 1 · presets.current 1

Never called: files.rename, files.remove, measure.edge, measure.angle, selection, presets.list, presets.create, presets.load, presets.rename, help
