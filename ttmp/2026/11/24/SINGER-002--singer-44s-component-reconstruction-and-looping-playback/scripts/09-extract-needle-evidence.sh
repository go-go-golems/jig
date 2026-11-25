#!/bin/bash
# Usage: bash 09-extract-needle-evidence.sh [Schmetz comparison PDF]
set -eu
sources=$(cd "$(dirname "$0")/../sources" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pdf=${1:-"$work/schmetz.pdf"}
if [ "$#" -eq 0 ]; then
  curl -fsSL 'https://www.schmetz.com/mm/media/web/7_tochtergesellschaften/bilder_18/schmetz/pdfs_4/datenblaetter/gegenueberstellung/Schmetz_DB_Gegenueberstellung_EN.pdf' -o "$pdf"
fi
pdftoppm -f 1 -l 1 -scale-to 1500 -singlefile -png "$pdf" "$work/dimensions"
pdftoppm -f 2 -l 2 -scale-to 1500 -singlefile -png "$pdf" "$work/comparison"
convert "$work/dimensions.png" -crop 910x350+75+833 +repage "$sources/needle-dimension-arrows.png"
convert "$work/comparison.png" -crop 1230x150+135+77 +repage "$sources/needle-130-705-universal.png"
photo="$sources/original-photos/Photo Nov 22 2026, 1 23 39 PM.jpg"
convert "$photo" -auto-orient -crop 910x540+1730+720 +repage -quality 89 "$sources/needle-clamp-right-screw.jpg"
