# Changelog

## 2026-11-22

- Initial workspace created

## 2026-11-22

Candela (pbr-spark) moved into jig at import/candela with history (git subtree, 9353740); jig builds both Candela bundles from it and the vendored copy is gone (f9f68fb); one docmgr root, the core in dist-core, Candela's tests run without npm (2fddb90)

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/import/candela/scripts/node-tests.mjs — Candela's tests through jig's esbuild
- /home/manuel/code/wesen/go-go-golems/jig/import/jigcad/build.mjs — builds Candela's bundles from import/candela

## 2026-11-22

jigcad --render auto also finds candela-rt next to the jigcad binary (468928c); make candela-rt and make test-candela; CI workflows candela.yml (engine tests, x86-64) and candela-rt.yml (self-hosted nvidia runner, gated by vars.NVIDIA_RUNNER)

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/.github/workflows/candela-rt.yml — GPU CI
- /home/manuel/code/wesen/go-go-golems/jig/pkg/render/find.go — auto lookup order
