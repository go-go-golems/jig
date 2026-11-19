# Tasks

- [x] L5 forces: mass properties from meshes, kinematics by central differences, reactions Jᵀλ = −Q with the least-norm split, `F:`/`T:` readings; `.speed .gravity .wrench .reactions`
- [x] Materials: Poisson's ratio and strength; steel, stainless, aluminium
- [x] L6 pipeline: weld → PLC → TetGen → C3D10; consistent loads (traction, pressure, wrench coupling, body); CalculiX deck and .dat reader; JS reference solver; post
- [x] `j.fea` builder, compile with a pending solve, worker op `'fea'`, host second phase, result cache
- [x] `.from(asm)`: worst pose, seats, held seat, body load, mechanism balance check
- [x] Stage: Stress overlay, title rows
- [x] Agent: `await fea.result()`, `await fea.faces()` (bridged, one shared solve per compile), docs records
- [x] Reference docs (content/docs/reference.md, src/agent/reference.md)
- [x] Engine tests 52–55, agent-eval fea test
- [x] tools/fea-wasm/build.sh (wasm32 CalculiX via freecad-web, TetGen)
- [x] Validate the built ccx.wasm/tetgen.wasm in Node and the browser; cross-check CalculiX against the JS solver (test 52) and CalculiX's reference results (check-reference.mjs)
- [ ] Decide whether vendor/fea is committed (as vendor/occt is) or built in CI
- [ ] IC(0) preconditioner for the JS solver
- [ ] A solver worker separate from the engine's queue
- [ ] `fea.probe(at)`; envelopes over several poses; async metrics for design search
