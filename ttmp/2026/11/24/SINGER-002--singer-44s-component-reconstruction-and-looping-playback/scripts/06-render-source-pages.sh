#!/bin/sh
set -eu
parts=${1:?Supply the Singer 44S family parts list PDF}
service=${2:?Supply the Singer family service manual PDF}
out=$(dirname "$0")/../sources
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pdftoppm -singlefile -f 2 -l 2 -scale-to 3600 -png "$parts" "$tmp/plate-a"
convert "$tmp/plate-a.png" -crop 650x600+1340+2050 +repage -rotate 90 "$out/plate-a-43.png"
pdftoppm -singlefile -f 11 -l 11 -scale-to 1100 -png "$service" "$out/service-needle-flow"
