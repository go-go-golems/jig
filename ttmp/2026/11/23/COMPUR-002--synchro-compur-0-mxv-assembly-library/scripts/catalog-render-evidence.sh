#!/usr/bin/env bash
# Render the two mating governor/cam revision tables from the supplied repair scan.
set -euo pipefail
pdf=${1:?usage: catalog-render-evidence.sh MANUAL.pdf}
sources=$(cd "$(dirname "$0")/../sources" && pwd)
for page in 253 254; do
    pdftoppm -singlefile -f "$page" -l "$page" -scale-to 1200 -gray -png \
        "$pdf" "$sources/catalog-factory-p$page"
done
