# Workspace

- `jigcad/`: the CAD workbench (jig language over OpenCascade): src (engine, stage, shell, agent), content (72 presets, a 23-chapter book, docs), tests, tools, vendored sources, the built dist/, and the design guides. Start with BUILD.md and BUILD-LOG.md. Build: `node build.mjs`; serve `dist/`. Check the book: `node tools/book-check.mjs`; check the presets: `node tools/preset-check.mjs`.
- `jig/`: the language design (README spec, 40 example files, tools/verify-numbers.py).
- `tools/`: the page builder and API-name checker used for the jig spec page.
- `transcripts/`: what exists of the session record (see its README).

Left out to keep the zip small: the uncompressed OpenCascade binary (vendor/occt/replicad_single.wasm, 23 MB; the gzip copy is included) and the test screenshots under test/*/out (regenerate with the test scripts).
