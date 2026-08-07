r"""Title-vs-footage zone audit for one spans pack.

WHY THIS EXISTS: brimstone/haven (Quible, U0IlINyWPdE) shipped skeleton rows whose
stand/target came from the author's chapter titles - and those titles were provably
wrong for all 9 chapters. Reading the in-game minimap zone label across the whole
video gave C Long / C Cubby x2 / Mid Courtyard / Mid Window / A Garden / A Sewer /
A Long x2, while the titles read "A Wine" / "A Lobby" x4 / "B Main" x2 /
"Defender Spawn" / "B Main - Stair". build_items.py trusts the title, so every zone
in the bucket was wrong. Quible authors five other packs, so the same defect has to
be ruled out on each rather than assumed absent.

The in-game zone label (the small caps text directly above the minimap) is the
ground truth: it is the engine's own callout for where the player is standing. It
only renders for a couple of seconds after the player crosses into a zone, so this
samples SEVERAL frames per chapter and tiles the label strip - at least one usually
catches it.

Output is one montage page per ~N chapters; read it and compare against the printed
title column.

  python _zone_audit.py <video_id> <spans-pack-path> [--per 4]
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

VID = sys.argv[1]
PACK = Path(sys.argv[2])
PER = 4
if "--per" in sys.argv:
    PER = int(sys.argv[sys.argv.index("--per") + 1])

SRC = Path.home() / "AppData/Local/Temp/mga-debug-source" / f"{VID}.mp4"
OUT = Path.home() / "OneDrive/Desktop/mga-frame-study" / f"zone-audit-{VID}"
if not SRC.is_file():
    raise SystemExit(f"ABORT - source video not cached: {SRC}")

pack = json.loads(PACK.read_text(encoding="utf-8"))
lineups = pack["lineups"]
# The pack stores only the chapter START (`cs`); the end is the next row's start, and the
# last row runs to the video end.
dur = float(subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration",
     "-of", "default=noprint_wrappers=1:nokey=1", str(SRC)],
    capture_output=True, text=True, check=True).stdout.strip())
starts = [float(l["cs"]) for l in lineups]
ends = starts[1:] + [dur]

shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir(parents=True, exist_ok=True)

# Label strip: the zone caption sits just above the minimap disc, upper-left of the frame.
# 2560x1440 -> roughly x 0..520, y 0..70. Grab a generous strip so a longer callout
# ("Mid Courtyard") is not clipped.
CROP = "560:70:0:8"

shots = []
for (l, t0, t1) in zip(lineups, starts, ends):
    span = t1 - t0
    for k in range(PER):
        # Skip the first ~15% (walk-in / title card) and the last ~10% (editor outro cut).
        ts = t0 + span * (0.18 + 0.62 * k / max(1, PER - 1))
        png = OUT / f"c{int(t0):04d}_{k}.png"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{ts:.3f}", "-i", str(SRC),
             "-frames:v", "1", "-vf", f"crop={CROP}", str(png)], check=True)
        shots.append((int(t0), png))

print(f"{VID}  {len(lineups)} chapters, {PER} samples each\n")
for l, t0, t1 in zip(lineups, starts, ends):
    print(f"  cs={int(t0):>4}-{int(t1):<4} title={l['title']!r:<46} "
          f"stand={l['stand']!r:<12} target={l['target']!r}")

# One montage page per chapter-group so rows line up with chapters: PER tiles wide.
rows_per_page = 8
pages = [lineups[i:i + rows_per_page] for i in range(0, len(lineups), rows_per_page)]
for p, group in enumerate(pages, 1):
    tiles = []
    for l in group:
        tiles += [png for t0, png in shots if t0 == int(l["cs"])]
    # ffmpeg's `tile` filter tiles successive FRAMES OF ONE STREAM, not N separate inputs
    # (feeding it `-i` per tile silently produces a 1-tile page). So stage the crops under
    # a numbered name and read them back as an image2 sequence.
    seq = OUT / f"_seq{p:02d}"
    shutil.rmtree(seq, ignore_errors=True)
    seq.mkdir(parents=True, exist_ok=True)
    for i, t in enumerate(tiles, 1):
        shutil.copy2(t, seq / f"s{i:03d}.png")
    page = OUT / f"page{p:02d}.png"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-framerate", "1", "-i", str(seq / "s%03d.png"),
         "-vf", f"tile={PER}x{len(group)}:padding=6:color=0x202020", "-frames:v", "1", str(page)],
        check=True)
    shutil.rmtree(seq, ignore_errors=True)
    print(f"\n  {page}   ({len(group)} chapters x {PER})")
    for l in group:
        print(f"    row: cs={l['cs']:<5} {l['title']}")
