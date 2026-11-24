#!/bin/sh
# Run from the Jig repository root after make web.
set -eu
if [ "$#" -ne 3 ]; then
  echo 'usage: sh source-figures.sh MODEL_ZIP TEXT_LAYER_MANUAL_PDF NEW_OUTPUT_DIR' >&2
  exit 2
fi
model=$1
manual=$2
out=$3
here=$(dirname "$0")
mkdir "$out"
book="$out/inputs/compur/book"
mkdir -p "$book/web/img/src" "$book/data"
unzip -p "$model" compur/book/data/plate2.json > "$book/data/plate2.json"
unzip -p "$model" compur/book/web/img/src/plate2-front.jpg > "$book/web/img/src/plate2-front.jpg"
unzip -p "$model" compur/book/web/img/src/plate7-blades.jpg > "$out/compur-plate7.jpg"
unzip -p "$model" compur/book/web/img/src/l9-fig59.jpg > "$out/compur-lesson9-timer.jpg"
pdftoppm -f 9 -l 9 -scale-to 2300 -singlefile -x 145 -y 608 -W 440 -H 440 \
  -png "$manual" "$out/compur-seat-section"
node "$here/mesh.mjs" "$out"
/usr/bin/python3 "$here/figures.py" "$out" "$book"
