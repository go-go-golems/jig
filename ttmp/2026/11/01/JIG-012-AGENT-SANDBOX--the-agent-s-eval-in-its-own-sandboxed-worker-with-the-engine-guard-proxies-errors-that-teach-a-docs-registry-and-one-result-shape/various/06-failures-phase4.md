# Agent eval failures

Runs: 70 · steps: 450 · failed steps: 69 (15 %) · runs with a misuse error: 11 (16 %) · runs with a stuck loop (≥ 3 failures in a row): 1

| Class | Steps | Runs | Example |
|---|---:|---:|---|
| promise not awaited | 49 | 38 | `ok: undefined` |
| other error | 31 | 21 | `Error: faces: selector: unknown token 'shell/inner*' in 'shell/inner*'` |
| **guarded name: program.find** | 2 | 2 | `TypeError: program.find does not exist. (program has: bodies, decisions, diagnostics, graph, ir, metrics, params, print, summary, trace) help('program') says wh` |
| **not a function: .diagnostics** | 2 | 1 | `TypeError: prog.diagnostics is not a function (line 8)` |
| **not a function: .metrics** | 2 | 2 | `TypeError: res.metrics is not a function (line 5)` |
| **not a function: .to** | 1 | 1 | `TypeError: mesh.travelPerTurn.to is not a function (line 5)` |
| **guarded name: check().program.genealogy** | 1 | 1 | `TypeError: check().program.genealogy does not exist. (check().program has: bodies, decisions, diagnostics, faces, feature, graph, ir, measure, metrics, params, ` |
| **guarded name: check().program.find** | 1 | 1 | `TypeError: check().program.find does not exist. (check().program has: bodies, decisions, diagnostics, faces, feature, graph, ir, measure, metrics, params, print` |
| **not a function: .filter** | 1 | 1 | `TypeError: files.read(...).filter is not a function (line 1)` |
| **read of undefined: .center** | 1 | 1 | `TypeError: Cannot read properties of undefined (reading 'center') (line 5)` |
| **not a function: .toFixed** | 1 | 1 | `TypeError: v.toFixed is not a function (line 6)` |
| **guarded name: program.faces** | 1 | 1 | `TypeError: program.faces does not exist. In scope on its own: faces(…). (program has: bodies, decisions, diagnostics, graph, ir, metrics, params, print, summary` |
| **not a function: .bbox** | 1 | 1 | `TypeError: head.bbox is not a function (line 4)` |

Misuse classes are in bold.

Steps to recover after a failed step: 1: 58 · 2: 10 · 3: 1

Stuck loops: default #1 a01-engrave (3)

Scope names called (steps): files.read 150 · j. 122 · check 118 · run 68 · files.edit 54 · faces 42 · program.metrics 39 · files.grep 21 · files.list 20 · look 20 · sketch 19 · program.summary 10 · program.params 10 · help 10 · program.diagnostics 9 · program.bodies 6 · measure.face 6 · measure.distance 6 · program.decisions 5 · params.get 4 · params.set 4 · params.overrides 4 · why 3 · presets.current 3 · program.graph 2 · program.ir 2 · program.print 2 · feature 2 · measure.bbox 2 · params.clear 2 · measure.area 1 · params.list 1 · presets.list 1 · presets.create 1

Never called: files.write, files.rename, files.remove, program.trace, measure.edge, measure.angle, selection, select, view.get, view.set, exportFile, presets.load, presets.rename, lab.
