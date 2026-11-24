#!/bin/bash
set -eu
archive=${1:?Supply the original singer-videos.zip}
out=$(dirname "$0")/../sources
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
unzip -q "$archive" -d "$work"
mkdir -p "$out"
photo() {
  convert "$work/Photo Nov 22 2026, 1 $1 PM.jpg" -auto-orient \
    -resize '960x960>' -quality 88 "$out/$2.jpg"
}
frame() {
  ffmpeg -v error -y -ss "$2" -i "$work/Video Nov 22 2026, 1 $1 PM.mov" \
    -frames:v 1 -vf 'scale=-2:840' -q:v 3 "$out/$3.jpg"
}
photo '24 39' linkage
photo '23 39' needle-and-plate
frame '24 45' 3 overview-03s
frame '25 09' 2 linkage-02s
frame '25 09' 8 linkage-08s
frame '25 09' 25 plate-25s
