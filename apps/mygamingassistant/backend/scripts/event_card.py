r"""QA gate for frame-study localization: tile the 4 pinned event MIDFRAMES
(STAND | AIM | THROW | LANDING) from the cached source video into ONE small
contact card so the localization can be eyeballed BEFORE a recut commits it.

Mode-invariant visual check (per cs2-lineup-expert + feedback_mga_localize_by_frame_study):
  STAND   = player demonstrating the spot (look at feet / settled at stance)
  AIM     = crosshair parked on the alignment landmark, utility in hand
  THROW   = the release frame (grenade leaving hand) — NOT the practice arc
  LANDING = the in-world deploy onset (smoke grey/white bloom at destination)

No DB / MinIO — reads only the cached %TEMP%/mga-debug-source/<video>.mp4 at the
given span midpoints, so it works on proposed spans before they are cut.

Run from the backend dir, main venv:
  .venv\Scripts\python.exe scripts\event_card.py --video 6DduFLHu7zM --label cc-33bbc4d1 \
      --stand 18.5 21.0 --aim 33.0 34.2 --throw 34.6 35.5 --landing 38.0 39.5
"""
import argparse
import subprocess
import sys
from pathlib import Path

DESKTOP_BASE = Path.home() / "OneDrive" / "Desktop" / "mga-frame-study"
SOURCE_DIR = Path.home() / "AppData" / "Local" / "Temp" / "mga-debug-source"
_PANES = ("stand", "aim", "throw", "landing")
TILE_W, TILE_H = 560, 315  # 16:9


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default="6DduFLHu7zM")
    ap.add_argument("--label", required=True, help="output card name (e.g. cc-33bbc4d1)")
    for pane in _PANES:
        ap.add_argument(f"--{pane}", nargs=2, type=float, metavar=("START", "END"),
                        required=True, help=f"{pane.upper()} span [start end] abs source seconds")
    args = ap.parse_args()

    video = SOURCE_DIR / f"{args.video}.mp4"
    if not video.exists():
        sys.exit(f"ERROR: cached video missing: {video}")

    spans = {p: tuple(getattr(args, p)) for p in _PANES}
    mids = {p: (s + e) / 2.0 for p, (s, e) in spans.items()}

    out = DESKTOP_BASE / "cache-cards"
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f"{args.label}.png"

    # One ffmpeg call: 4 seeked inputs (one per event midframe) -> scale+pad each
    # to a uniform tile -> hstack into a 1x4 card. (No drawtext — this ffmpeg
    # build lacks fontconfig; pane order is fixed STAND|AIM|THROW|LANDING and the
    # timestamps are printed below.)
    inputs: list[str] = []
    filt: list[str] = []
    for j, pane in enumerate(_PANES):
        inputs += ["-ss", f"{mids[pane]:.3f}", "-i", str(video)]
        filt.append(
            f"[{j}:v]scale={TILE_W}:{TILE_H}:force_original_aspect_ratio=decrease,"
            f"pad={TILE_W}:{TILE_H}:(ow-iw)/2:(oh-ih)/2:color=gray[v{j}]"
        )
    labels = "".join(f"[v{j}]" for j in range(len(_PANES)))
    filt.append(f"{labels}hstack=inputs={len(_PANES)}[out]")
    graph = ";".join(filt)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs,
           "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", str(dest)]
    subprocess.run(cmd, check=True)

    print(f"card -> {dest}")
    print("panes (left -> right):")
    for pane in _PANES:
        s, e = spans[pane]
        print(f"  {pane.upper():8} span=[{s:.2f},{e:.2f}]  midframe@{mids[pane]:.2f}s  (len {e - s:.2f}s)")


if __name__ == "__main__":
    main()
