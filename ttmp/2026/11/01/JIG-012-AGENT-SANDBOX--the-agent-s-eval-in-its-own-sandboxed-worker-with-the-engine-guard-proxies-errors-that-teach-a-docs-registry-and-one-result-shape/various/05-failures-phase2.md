# Agent eval failures

Runs: 66 · steps: 386 · failed steps: 60 (16 %) · runs with a misuse error: 12 (18 %) · runs with a stuck loop (≥ 3 failures in a row): 1

| Class | Steps | Runs | Example |
|---|---:|---:|---|
| promise not awaited | 31 | 29 | `undefined` |
| other error | 25 | 19 | `Error: read-only mode: files.edit is off (line 1)` |
| **not a function: .map** | 4 | 3 | `TypeError: p.faces(...).map is not a function (line 3)` |
| **not a function: .slice** | 2 | 1 | `TypeError: logo.slice is not a function (line 7)` |
| **read of undefined: .volume** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'volume') (line 3)` |
| **not a function: .split** | 1 | 1 | `TypeError: txt.split is not a function (line 5)` |
| **guarded name: check().program.genealogy** | 1 | 1 | `TypeError: check().program.genealogy does not exist. (check().program has: bodies, decisions, diagnostics, faces, feature, graph, ir, measure, metrics, params, ` |
| **read of undefined: .dof** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'dof') (line 9)` |
| **read of undefined: .filter** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'filter') (line 11)` |
| **read of undefined: .find** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'find') (line 3)` |
| **guarded name: program.faces** | 1 | 1 | `TypeError: program.faces does not exist. In scope on its own: faces(…). (program has: bodies, decisions, diagnostics, graph, ir, metrics, params, print, summary` |
| **read of undefined: .ir** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'ir') (line 6)` |
| **not a function: .then** | 1 | 1 | `TypeError: files.read(...).then is not a function (line 1)` |
| **guarded name: check().program.sketches** | 1 | 1 | `TypeError: check().program.sketches does not exist. Did you mean check().program.sket…` |
| **read of undefined: .sketch** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'sketch') (line 4)` |
| **not a function: .join** | 1 | 1 | `TypeError: files.read(...).join is not a function (line 1)` |
| **not a function: .on** | 1 | 1 | `TypeError: j.frame.on is not a function (line 1)` |
| **not a function: .created** | 1 | 1 | `TypeError: p.faces(...).created is not a function (line 6)` |

Misuse classes are in bold.

Steps to recover after a failed step: 1: 45 · 2: 13 · 3: 1 · never: 1

Stuck loops: complex #1 v02-a01-engrave-front (3)

Scope names called (steps): files.read 148 · check 111 · j. 73 · run 57 · files.edit 52 · faces 46 · program.metrics 27 · files.grep 19 · look 18 · files.list 17 · program.diagnostics 14 · program.params 14 · sketch 12 · program.summary 9 · params.list 7 · program.bodies 5 · params.get 5 · params.set 5 · program.decisions 4 · program.print 3 · why 3 · measure.face 3 · measure.bbox 3 · params.clear 3 · program.graph 2 · measure.distance 2 · params.overrides 2 · program.ir 1 · feature 1 · view.set 1

Never called: files.write, files.rename, files.remove, program.trace, measure.edge, measure.angle, measure.area, selection, select, view.get, exportFile, presets.list, presets.load, presets.current, presets.create, presets.rename, lab., help
