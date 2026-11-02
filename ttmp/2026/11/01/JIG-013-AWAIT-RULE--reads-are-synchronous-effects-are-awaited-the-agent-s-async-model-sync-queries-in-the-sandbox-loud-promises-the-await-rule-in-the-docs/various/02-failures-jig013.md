# Agent eval failures

Runs: 140 · steps: 774 · failed steps: 87 (11 %) · runs with a misuse error: 21 (15 %) · runs with a stuck loop (≥ 3 failures in a row): 2

| Class | Steps | Runs | Example |
|---|---:|---:|---|
| other error | 57 | 37 | `Error: read-only mode: files.edit is off (line 1)` |
| **not a function: .metrics** | 4 | 4 | `TypeError: r.metrics is not a function (line 9)` |
| **guarded name: program.faces** | 4 | 3 | `TypeError: program.faces does not exist. In scope on its own: faces(…). (program has: bodies, decisions, diagnostics, graph, ir, metrics, params, print, summary` |
| **read of undefined: .toFixed** | 3 | 2 | `TypeError: Cannot read properties of undefined (reading 'toFixed') (line 1)` |
| **guarded name: check().program.sketches** | 2 | 2 | `TypeError: check().program.sketches does not exist. Did you mean check().program.sketch? (check().program has: bodies, decisions, diagnostics, faces, feature, g` |
| **read of undefined: .volume** | 2 | 2 | `TypeError: Cannot read properties of undefined (reading 'volume') (line 3)` |
| **read of undefined: .constructor** | 2 | 2 | `TypeError: Cannot read properties of null (reading 'constructor') (line 1)` |
| **read of undefined: .moved** | 1 | 1 | `TypeError: Cannot read properties of null (reading 'moved') (line 11)` |
| **not a function: .bodies** | 1 | 1 | `TypeError: p1.bodies is not a function (line 3)` |
| **guarded name: check().program.P** | 1 | 1 | `TypeError: check().program.P does not exist. (check().program has: bodies, decisions, diagnostics, faces, feature, graph, ir, measure, metrics, params, print, s` |
| **read of undefined: .metrics** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'metrics') (line 3)` |
| **guarded name: program.sketch** | 1 | 1 | `TypeError: program.sketch does not exist. sketch is lab.sketch. In scope on its own: sketch(…). (program has: bodies, decisions, diagnostics, graph, ir, metrics` |
| **read of undefined: .map** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'map') (line 1)` |
| **guarded name: check().program.find** | 1 | 1 | `TypeError: check().program.find does not exist. (check().program has: bodies, decisions, diagnostics, faces, feature, graph, ir, measure, metrics, params, print` |
| syntax error | 1 | 1 | `SyntaxError: missing ) after argument list` |
| **read of undefined: .1** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading '1') (line 9)` |
| **guarded name: check().program.edges** | 1 | 1 | `TypeError: check().program.edges does not exist. (check().program has: bodies, decisions, diagnostics, faces, feature, graph, ir, measure, metrics, params, prin` |
| **not a function: .diagnostics** | 1 | 1 | `TypeError: prog.diagnostics is not a function (line 8)` |
| **not a function: .join** | 1 | 1 | `TypeError: files.read(...).join is not a function (line 1)` |
| **not a function: .toFixed** | 1 | 1 | `TypeError: bottom.center.toFixed is not a function (line 13)` |

Misuse classes are in bold.

Steps to recover after a failed step: 1: 68 · 2: 13 · 3: 2 · 4: 1 · never: 3

Stuck loops: default #1 u01-cat-magnet-pin (3); default #2 w01-a01-hole-misses (4)

Scope names called (steps): files.read 257 · check 246 · j. 191 · run 133 · files.edit 107 · faces 56 · look 55 · program.metrics 39 · files.list 32 · files.grep 28 · sketch 13 · help 12 · view.set 10 · params.overrides 10 · params.set 8 · program.diagnostics 7 · presets.current 6 · why 5 · measure.distance 5 · program.summary 4 · program.params 4 · program.decisions 4 · measure.face 4 · params.list 4 · select 3 · params.get 3 · params.clear 3 · program.ir 1 · feature 1 · view.get 1 · presets.load 1 · presets.create 1 · lab. 1

Never called: files.write, files.rename, files.remove, program.trace, program.graph, program.bodies, program.print, measure.edge, measure.angle, measure.bbox, measure.area, selection, exportFile, presets.list, presets.rename
