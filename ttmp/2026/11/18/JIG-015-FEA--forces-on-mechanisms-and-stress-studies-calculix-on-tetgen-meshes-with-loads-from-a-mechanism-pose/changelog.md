# Changelog

## 2026-11-18

- L5 forces on mechanism studies (src/engine/dynamics.js; assembly builder `.speed .gravity .wrench .reactions .loadCase`); engine test 54.
- L6 stress studies: src/fea/* (mesh, loads, deck, JS solver, post, backends, solve) and src/engine/fea.js (`j.fea`); worker op `'fea'`, host second phase; Stress overlay; engine tests 52, 53, 55.
- Materials gain `nu` and `strength`; steel, stainless, aluminium.
- Agent scope `fea.result()` / `fea.faces()`, bridged through the sandbox; the host shares one solve per compile; test/agent-eval/fea.test.mjs.
- tools/fea-wasm/build.sh; build.mjs copies vendor/fea to dist/fea.
- Spec v0.2 (design-doc/01).
- CalculiX 2.22 and TetGen 1.6.0 wasm32 modules built from tools/fea-wasm/build.sh, checked: CalculiX's beam10p reference reproduced exactly through jig's deck; engine 52–55 and the agent test on the modules alone; both studies solved in headless Chrome.
- Fixes from running CalculiX: reactions are K·u − f (CalculiX prints K·u, so loads on held nodes were missing); the `'fea'` op replies with a patch (the whole program held detached buffers and could not be posted); the program's stress field is a copy of the cached one; the module lookup in a page no longer probes vendor/ (a 404 in the console); reactions over a missing study are an error.
- The studied part takes the study's material (mass, cost, title); the Stage panel lists safety factor, stress and displacement first.
