---
Title: 'Forces on mechanisms and stress studies: CalculiX on TetGen meshes, with loads from a mechanism pose'
Ticket: JIG-015-FEA
Status: active
Topics:
    - assembly
    - engine
    - fea
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - import/jigcad/src/engine/dynamics.js
    - import/jigcad/src/engine/assembly.js
    - import/jigcad/src/engine/fea.js
    - import/jigcad/src/fea/
    - import/jigcad/src/agent/scope.js
    - import/jigcad/tools/fea-wasm/build.sh
ExternalSources:
    - https://github.com/calculix/calculix
    - https://github.com/ufz/tetgen
Summary: "Spec v0.2 layers 5 and 6: reactions and drive torques over a mechanism study (inverse dynamics on the joint Jacobian), and j.fea stress studies (TetGen C3D10, CalculiX or a JS reference solver) that can take a component's loads from a mechanism pose."
LastUpdated: 2026-11-18T12:00:00-05:00
WhatFor: "Checking that a part survives its loads, and knowing the loads a mechanism puts on its parts."
WhenToUse: "Reading or changing forces on assemblies, stress studies, the FEA pipeline or its wasm modules."
---

# Forces on mechanisms and stress studies

## Overview

Two layers on top of JIG-014's mechanisms. L5 adds `F:<joint>` and `T:<drive>` to study rows; L6 adds `j.fea(…)`, a component of the language that compiles to its part with a pending solve, solved in a second engine op. `.from(asm, { component, study })` connects them. The spec is [design-doc/01-forces-and-stress-spec-v0.2.md](design-doc/01-forces-and-stress-spec-v0.2.md).

## Key links

- Spec: design-doc/01-forces-and-stress-spec-v0.2.md
- Tests: test/engine/run.mjs 52–55 (needs `JIG_TETGEN` or vendor/fea), test/agent-eval/fea.test.mjs
- Build of the wasm modules: tools/fea-wasm/build.sh
