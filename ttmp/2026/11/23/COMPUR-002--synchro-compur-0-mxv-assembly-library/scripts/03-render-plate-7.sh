#!/bin/sh
# Render the same factory page and size-0 detail used in the reconciliation.
set -eu
pdf=${1:?"usage: 03-render-plate-7.sh MANUAL.pdf [output-directory]"}
out=${2:-"$(dirname "$0")/../sources/plate-7"}
mkdir -p "$out"
pdftoppm -f 56 -l 56 -scale-to 1750 -singlefile -png "$pdf" "$out/factory-p056"
pdftoppm -f 56 -l 56 -scale-to 3000 -x 98 -y 1350 -W 990 -H 1240 \
  -singlefile -png "$pdf" "$out/size-0-detail"
