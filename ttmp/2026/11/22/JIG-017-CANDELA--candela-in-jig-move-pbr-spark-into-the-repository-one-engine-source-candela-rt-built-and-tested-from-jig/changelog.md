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

## 2026-11-22

Golden test fixed: the 10 differences are CPU architecture (arm64 baseline vs x86-64; 105/105 against an x86-64 baseline made at the baseline's own commit), so one baseline per architecture; a bundling bug ran core-digest's main inside the golden test (isMain fixes it); core-digest's vm is 30x faster with builtins bound locally (585 s -> 18.5 s). Candela's tests (13 s) now run in make test-js; candela.yml removed

### Related Files

- /home/manuel/code/wesen/go-go-golems/jig/import/candela/scripts/core-digest.ts — vm builtins bound locally
- /home/manuel/code/wesen/go-go-golems/jig/import/candela/tests/golden-pack.test.ts — per-architecture baseline
