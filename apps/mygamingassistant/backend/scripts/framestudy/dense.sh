#!/bin/bash
# dense.sh <video-id> <tag> <t0> <fps> <n> <cols> [scale]
#
# Cheap SCOUTING sheet: one input seek, then an fps= resample, so n frames cost one decode pass.
# Use it to answer "roughly where in this chapter does the deploy happen" over a wide window.
#
# NOT a measurement tool. The seek-and-resample path lands up to ~0.15s away from the frame the
# same nominal timestamp resolves to under -accurate_seek, and on long windows the drift is
# larger still. Never quote a span from this sheet -- find the event here, then pin it with
# frames.sh, which is exact.
#
#   ./dense.sh cTrav7nTu2Y 198full 198.5 1.5 32 8 420
#
# Writes q_<tag>.png in the current directory and prints the tile -> nominal-timestamp table.
set -euo pipefail

vid=$1; tag=$2; t0=$3; fps=$4; n=$5; cols=$6; sc=${7:-640}

SRC="${MGA_SOURCE_DIR:-$TEMP/mga-debug-source}/$vid.mp4"
[ -f "$SRC" ] || { echo "dense.sh: no cached source at $SRC" >&2; exit 2; }

d="q_$tag"; rm -rf "$d"; mkdir -p "$d"
dur=$(python -c "print($n/$fps + 0.05)")
ffmpeg -v error -ss "$t0" -t "$dur" -i "$SRC" -vf "fps=$fps,scale=$sc:-2" -vsync 0 \
  -frames:v "$n" "$d/%02d.png"
rows=$(( (n + cols - 1) / cols ))
ffmpeg -v error -y -i "$d/%02d.png" \
  -filter_complex "tile=${cols}x${rows}:margin=4:padding=4:color=red" -frames:v 1 "q_$tag.png"

python - "$tag" "$t0" "$fps" "$n" "$cols" <<'PY'
import sys
tag, t0, fps, n, cols = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
print(f"q_{tag}.png  {cols} cols, NOMINAL times (scouting only, pin with frames.sh):")
for i in range(n):
    if i % cols == 0:
        print()
    print(f"[{i + 1:02d}]={t0 + i / fps:.2f}", end="  ")
print()
PY
