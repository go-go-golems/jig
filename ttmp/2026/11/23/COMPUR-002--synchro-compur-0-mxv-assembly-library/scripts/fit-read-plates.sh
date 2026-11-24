#!/bin/sh
# Render the original sheets for reading. Argument 1 is the factory manual PDF.
# Argument 2 is the scratch directory to receive full-resolution PNGs.
set -eu
mkdir -p "$2"
for page in 53 54 55 58 132 133 134 135; do
    pdftoppm -f "$page" -l "$page" -scale-to 1700 -png -singlefile "$1" "$2/page-$page"
done
