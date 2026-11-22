#!/bin/sh
# vendor-candela.sh: copy Candela's engine source (TypeScript, no npm dependencies) from a pbr-spark checkout into
# vendor/candela/, pinned to one commit. jig's build.mjs bundles it with esbuild into dist/candela.js (the page and
# Node tests) and dist/candela-core.js (the IIFE candela-rt loads with --bundle).
#
#   tools/vendor-candela.sh <pbr-spark checkout> [ref]      (ref defaults to HEAD)
#
# Copied: src/engine/** and src/content/catalog.ts (core.ts re-exports the catalog loader). The copy is taken with
# `git archive`, so uncommitted edits in the checkout never leak in. VERSIONS names the commit; SHA256SUMS covers
# every vendored file. Changes to the engine go to pbr-spark first and come back with the next vendoring.
set -eu
SRC=${1:?usage: tools/vendor-candela.sh <pbr-spark checkout> [ref]}
REF=${2:-HEAD}
HERE=$(cd "$(dirname "$0")/.." && pwd)
DEST="$HERE/vendor/candela"
rev=$(git -C "$SRC" rev-parse --verify "$REF^{commit}")
date=$(git -C "$SRC" log -1 --format=%cs "$rev")
remote=$(git -C "$SRC" config --get remote.origin.url || echo unknown)
rm -rf "$DEST/src"
mkdir -p "$DEST"
git -C "$SRC" archive "$rev" src/engine src/content/catalog.ts | tar -x -C "$DEST"
(cd "$DEST" && find src -type f | LC_ALL=C sort | xargs sha256sum > SHA256SUMS)
printf 'candela  %s  %s  %s (git archive: src/engine, src/content/catalog.ts)\n' "$rev" "$date" "$remote" > "$DEST/VERSIONS"
echo "vendor/candela: $(wc -l < "$DEST/SHA256SUMS" | tr -d ' ') files from $rev ($date)"
