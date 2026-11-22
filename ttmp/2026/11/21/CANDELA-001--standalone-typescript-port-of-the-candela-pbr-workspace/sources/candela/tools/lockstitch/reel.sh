#!/bin/sh
# tools/lockstitch/reel.sh <dir> — join the seven scene videos into one reel: the one-stitch scenes play twice, the
# zigzag (two stitches) and the whole head (rendered as four stitches with an orbiting camera) once, with the scene's
# name in the corner. Needs ffmpeg with libx264 and drawtext.
set -e
D=${1:-/home/claude/shots/lockstitch/video}
FONT=${FONT:-/usr/share/fonts/opentype/inter/Inter-Medium.otf}
cap() { printf "drawtext=fontfile=%s:text='%s':x=28:y=h-52:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=9" "$FONT" "$1"; }
ffmpeg -v error -y \
  -stream_loop 1 -i "$D/S-01-needle-bar.mp4" -stream_loop 1 -i "$D/S-02-take-up-lever.mp4" -stream_loop 1 -i "$D/S-03-rotary-hook.mp4" \
  -stream_loop 1 -i "$D/S-04-four-motion-feed.mp4" -stream_loop 1 -i "$D/S-05-thread-path.mp4" -i "$D/S-06-zigzag.mp4" \
  -i "$D/S-07-whole-head.mp4" \
  -filter_complex "\
[0:v]$(cap 'S-01  Needle bar · slider-crank'),setsar=1[a];\
[1:v]$(cap 'S-02  Take-up lever · four-bar on the crank pin'),setsar=1[b];\
[2:v]$(cap 'S-03  Rotary hook · 2\:1, crossed helical gears'),setsar=1[c];\
[3:v]$(cap 'S-04  Four-motion feed · two eccentrics, rock shaft, feed bar'),setsar=1[d];\
[4:v]$(cap 'S-05  Thread path · tension, check spring, take-up'),setsar=1[e];\
[5:v]$(cap 'S-06  Zigzag · the gate swings between stitches'),setsar=1[f];\
[6:v]$(cap 'S-07  Whole head · everything on one shaft'),setsar=1[g];\
[a][b][c][d][e][f][g]concat=n=7:v=1:a=0,format=yuv420p[out]" \
  -map "[out]" -c:v libx264 -preset slow -crf 18 -movflags +faststart "$D/lockstitch-reel.mp4"
ffprobe -v error -show_entries format=duration,size -of compact "$D/lockstitch-reel.mp4"
