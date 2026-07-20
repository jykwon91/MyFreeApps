r"""CONTENT verifier for lineup localization — the real gate that verify_clips.py
never was.

verify_clips.py only ffprobed each clip's DURATION + byte size, so a lineup cut
from completely wrong timestamps passed *identically* to a correct one. Every
shipped wave (Anubis, Cache, suspected Mirage) was "Y Y Y Y verified" while being
wrong, because nothing ever checked the clips' CONTENT.

This samples the actual FRAMES across each claimed event window so the
localization is judged on what's on screen — by a vision model and/or the
operator — BEFORE a recut/accept commits it. For each of the 4 events it pulls K
full-res frames evenly spanning [start, end] (the THROW gets a denser sample —
the release is the precision-critical instant), tiles them into one labeled strip
per event, and also stacks the four strips into a single overview card.

Judge each strip against its per-event signature (cs2-lineup-expert /
valorant-lineup-expert):
  STAND   = the player DEMONSTRATING the spot (look at feet / settled at stance)
  AIM     = crosshair parked on the alignment landmark, ability in hand
  THROW   = the RELEASE (grenade leaves hand / Sova bow looses) — NOT the
            aim-dwell, NOT a practice trajectory arc / preview
  LANDING = the in-world deploy ONSET at the destination (smoke bloom / fire /
            flash / Sova recon sonar-pulse / shock electric-burst)

A window whose strip does NOT contain its event (e.g. a THROW strip still showing
the player aiming) is a MISMATCH -> re-localize with frame_study.py before
accepting. The operator's eyeball on the full-res strips is the final gate.

No DB / MinIO — reads only the cached source video, so it gates PROPOSED spans
before they are cut. Single-stage `-ss ts -i video -frames:v 1` per frame == the
exact seek the clip cutter uses (frame-accurate + cut-consistent; see
frame_study.py).

Run from the backend dir, main venv:
  .venv\Scripts\python.exe scripts\verify_events.py --video 6DduFLHu7zM --label cc-33bbc4d1 \
      --stand 29 31 --aim 32 33.7 --throw 33.5 34.1 --landing 36 37.5
"""
import argparse
import subprocess
import sys
from pathlib import Path

SOURCE_DIR = Path.home() / "AppData" / "Local" / "Temp" / "mga-debug-source"
DESKTOP_BASE = Path.home() / "OneDrive" / "Desktop" / "mga-frame-study"
_PANES = ("stand", "aim", "throw", "landing")
TILE_W, TILE_H = 384, 216  # 16:9 per-frame tile; K tiles hstacked => one event strip


def sample_times(s: float, e: float, k: int) -> list[float]:
    """k frames evenly across [s, e] inclusive (midframe if degenerate)."""
    if k <= 1 or e <= s:
        return [(s + e) / 2.0]
    return [s + (e - s) * i / (k - 1) for i in range(k)]


def hstack_frames(video: Path, times: list[float], dest: Path) -> None:
    """One ffmpeg call: seek each time, scale+pad to a uniform tile, hstack."""
    inputs: list[str] = []
    filt: list[str] = []
    for j, ts in enumerate(times):
        inputs += ["-ss", f"{ts:.3f}", "-i", str(video)]
        filt.append(
            f"[{j}:v]scale={TILE_W}:{TILE_H}:force_original_aspect_ratio=decrease,"
            f"pad={TILE_W}:{TILE_H}:(ow-iw)/2:(oh-ih)/2:color=black[v{j}]"
        )
    labels = "".join(f"[v{j}]" for j in range(len(times)))
    filt.append(f"{labels}hstack=inputs={len(times)}[out]")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *inputs,
         "-filter_complex", ";".join(filt), "-map", "[out]", "-frames:v", "1", str(dest)],
        check=True,
    )


def vstack_strips(strips: list[Path], dest: Path) -> None:
    """Normalize each event strip to a common width, stack vertically."""
    inputs: list[str] = []
    filt: list[str] = []
    for j, p in enumerate(strips):
        inputs += ["-i", str(p)]
        filt.append(f"[{j}:v]scale=1920:-2[s{j}]")
    labels = "".join(f"[s{j}]" for j in range(len(strips)))
    filt.append(f"{labels}vstack=inputs={len(strips)}[out]")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *inputs,
         "-filter_complex", ";".join(filt), "-map", "[out]", "-frames:v", "1", str(dest)],
        check=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default="6DduFLHu7zM")
    ap.add_argument("--label", required=True, help="output card name (e.g. cc-33bbc4d1)")
    ap.add_argument("--k", type=int, default=5, help="frames sampled per event window")
    ap.add_argument("--throw-k", type=int, default=9, help="denser sample for the THROW window")
    for pane in _PANES:
        ap.add_argument(f"--{pane}", nargs=2, type=float, metavar=("START", "END"),
                        required=True, help=f"{pane.upper()} span [start end] abs source seconds")
    args = ap.parse_args()

    video = SOURCE_DIR / f"{args.video}.mp4"
    if not video.exists():
        sys.exit(f"ERROR: cached video missing: {video}\n"
                 f"  (re-download the source first; verify_events reads the source, not MinIO)")

    out = DESKTOP_BASE / "verify-cards"
    out.mkdir(parents=True, exist_ok=True)

    print(f"== verify '{args.label}' :: {video.name} ==")
    strips: list[Path] = []
    for pane in _PANES:
        s, e = getattr(args, pane)
        k = args.throw_k if pane == "throw" else args.k
        times = sample_times(s, e, k)
        dest = out / f"{args.label}-{pane}.png"
        hstack_frames(video, times, dest)
        strips.append(dest)
        ts_str = " ".join(f"{t:.2f}" for t in times)
        print(f"  {pane.upper():8} [{s:.2f},{e:.2f}] len={e - s:.2f}s  {k} frames @ {ts_str}")
        print(f"           strip -> {dest}")

    card = out / f"{args.label}-CARD.png"
    vstack_strips(strips, card)
    print(f"\nOVERVIEW CARD (rows STAND / AIM / THROW / LANDING, time left->right):\n  {card}")
    print("\nJUDGE each strip against its signature. A window that does NOT contain its")
    print("event is a MISMATCH -> re-localize before accept. Operator eyeball is final;")
    print("never accept on file-validity alone (that was the verify_clips.py bug).")


if __name__ == "__main__":
    main()
