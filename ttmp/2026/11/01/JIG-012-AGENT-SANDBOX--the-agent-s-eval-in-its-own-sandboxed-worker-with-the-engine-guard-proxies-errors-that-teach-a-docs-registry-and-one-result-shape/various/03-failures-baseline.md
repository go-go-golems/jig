# Agent eval failures

Runs: 66 · steps: 361 · failed steps: 64 (18 %) · runs with a misuse error: 16 (24 %) · runs with a stuck loop (≥ 3 failures in a row): 2

| Class | Steps | Runs | Example |
|---|---:|---:|---|
| promise not awaited | 31 | 28 | `ok: undefined` |
| other error | 17 | 15 | `Error: read-only mode: files.edit is off (line 1)` |
| **not defined: j** | 14 | 11 | `ReferenceError: j is not defined (line 1)` |
| **not defined: mm** | 5 | 5 | `ReferenceError: mm is not defined (line 1)` |
| syntax error | 2 | 2 | `SyntaxError: Illegal return statement (line 2)` |
| **not defined: deg** | 2 | 2 | `ReferenceError: deg is not defined (line 4)` |
| **not a function: .slice** | 2 | 2 | `TypeError: n.faces.slice is not a function (line 2)` |
| **not a function: .metric** | 1 | 1 | `TypeError: program.metric is not a function (line 3)` |
| **not a function: .filter** | 1 | 1 | `TypeError: b.faces.filter is not a function (line 2)` |
| **read of undefined: .find** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'find') (line 17)` |
| **read of undefined: .toFixed** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'toFixed') (line 3)` |
| **read of undefined: .map** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'map') (line 4)` |
| **not a function: .find** | 1 | 1 | `TypeError: program.find is not a function (line 1)` |
| **not defined: mk** | 1 | 1 | `ReferenceError: mk is not defined (line 1)` |

Misuse classes are in bold.

Steps to recover after a failed step: 1: 44 · 2: 12 · 3: 2 · 4: 1 · never: 5

Stuck loops: default #1 m07-wheel-30 (3); default #1 m07-tooth-gap (4)

Scope names called (steps): files.read 125 · run 74 · j. 69 · program.metrics 57 · faces 56 · files.edit 55 · check 44 · program.params 25 · look 22 · program.summary 17 · files.grep 16 · program.diagnostics 16 · sketch 16 · files.list 10 · program.decisions 8 · feature 8 · program.bodies 7 · measure.bbox 7 · measure.distance 5 · params.get 5 · params.overrides 5 · program.print 4 · why 4 · params.clear 4 · view.set 3 · params.list 3 · files.write 2 · measure.face 2 · params.set 2 · program.graph 1 · program.ir 1 · measure.area 1 · view.get 1 · lab. 1

Never called: files.rename, files.remove, program.trace, measure.edge, measure.angle, selection, select, exportFile, presets.list, presets.load, presets.current, presets.create, presets.rename, help
