#!/bin/bash
# frames.sh <video-id> <tag> <cols> <scale> <t1> <t2> ...
#
# Frame-EXACT contact sheet: one ffmpeg invocation per timestamp with -accurate_seek, so each
# tile is the frame at that time and the tile->timestamp mapping is not an estimate.
#
# This exists because the cheap form -- a single input seek followed by an fps= resample, which
# is what dense.sh does -- disagrees with per-frame extraction by up to ~0.15s on the same
# nominal timestamps. That is enough to put a 0.3s Sova shock burst on the wrong side of a
# window boundary, and it did: on the abyss batch the resampled sheet and the exact sheet placed
# the same editor cut 0.2s apart, which is the difference between a clean landing clip and one
# that goes black a third of the way through. Use dense.sh to FIND an event cheaply, then use
# this to PIN it. Every span quoted as a measurement must come from this script, not that one.
#
# Slower by design: n seeks instead of one. That is the price of the mapping being true.
#
#   ./frames.sh cTrav7nTu2Y 198c 5 760 212.00 212.10 212.20 212.30
#
# Writes y_<tag>.png in the current directory and prints the tile -> timestamp table.
set -euo pipefail

vid=$1; tag=$2; cols=$3; sc=$4; shift 4
[ "$#" -gt 0 ] || { echo "frames.sh: give at least one timestamp" >&2; exit 2; }

# Same cache download_video.py writes to, so a source already pulled for ingest is reused.
SRC="${MGA_SOURCE_DIR:-$TEMP/mga-debug-source}/$vid.mp4"
[ -f "$SRC" ] || { echo "frames.sh: no cached source at $SRC" >&2; exit 2; }

d="y_$tag"; rm -rf "$d"; mkdir -p "$d"
i=0
for t in "$@"; do
  i=$((i+1))
  ffmpeg -v error -accurate_seek -ss "$t" -i "$SRC" -frames:v 1 -vf "scale=$sc:-2" \
    "$d/$(printf %02d "$i").png"
done
rows=$(( (i + cols - 1) / cols ))
ffmpeg -v error -y -i "$d/%02d.png" \
  -filter_complex "tile=${cols}x${rows}:margin=4:padding=4:color=red" -frames:v 1 "y_$tag.png"

echo "y_$tag.png  $i frames, $cols cols:"
python - "$cols" "$@" <<'PY'
import sys
cols = int(sys.argv[1])
for i, t in enumerate(sys.argv[2:]):
    if i % cols == 0:
        print()
    print(f"[{i + 1:02d}]={t}", end="  ")
print()
PY
