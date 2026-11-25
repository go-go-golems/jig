#!/bin/bash
# Paths to Singer's full 44S family parts book and service manual respectively.
set -eu
parts=${1:?Supply family parts catalogue}
service=${2:?Supply Singer 44S service manual}
out=$(dirname "$0")/../sources
mkdir -p "$out"
pdftoppm -f 10 -l 10 -singlefile -jpeg -scale-to 1500 "$service" "$out/presser-foot-gauge"
pdftoppm -f 10 -l 10 -singlefile -jpeg -scale-to 1900 "$parts" "$out/presser-plate-E"
pdftoppm -f 11 -l 11 -singlefile -jpeg -scale-to 1500 "$parts" "$out/presser-plate-E-list"
