r"""Full-res frame-study extractor — the instrument for operator-confirmed lineup
localization (STAND / AIM / THROW release / LANDING).

Method is the PROVEN one (the 9b "Stairs" jump-throw win): single-stage input
seek, contiguous decode, map frame i -> t0 + i/fps. The two-stage seek
(``-ss start-1`` before ``-i`` then ``-ss +1`` after) MIS-ANCHORS every frame's
timestamp (proven via PSNR vs a decode-from-start reference) AND diverges from
the clip cutter's own ``-ss t before -i`` seek, so a stored timestamp would cut
a different frame than the one studied. Single-stage is frame-accurate AND
cut-consistent.

Two modes:
  * DENSE (default, --step 0): one ffmpeg pass, EVERY frame at the source fps.
    Use inside a TIGHT window (~1-2 s) to pin an exact instant.
  * COARSE (--step S>0): one still every S seconds. The label IS the exact seek
    the cutter would use (``-ss ts -i`` lands on the first frame at or after ts).
    Use across a wider rough window to orient. When S spans a whole number of
    frames (0.5 s at 60 fps), the window is decoded ONCE and every Nth frame kept
    -- pixel-identical to a per-still seek (PSNR inf) and ~10x faster, because a
    per-still seek re-decodes the source from its previous keyframe (AV1
    sources key every ~6 s) and runs one ffmpeg per still. Other strides fall
    back to per-still seeks.

``--height H`` downscales every output frame to H px tall. It is for the SURVEY
only (720 is plenty to tell placements apart and read a caption); anything that
pins an event instant stays full-res.

Frames are FULL-RES singles (unless ``--height``) named ``f<idx>_t<abs>.png`` —
never tiles/grids (the operator judges at full res). Output goes to a per-label
folder on the operator's OneDrive Desktop, cleared first so stale frames from a
prior run can't be mixed in.

Run from the backend dir via the main checkout's venv:
  .venv\Scripts\python.exe scripts\frame_study.py --t0 27 --t1 42 --step 0.5 --label 01-mid-window
  .venv\Scripts\python.exe scripts\frame_study.py --t0 33.5 --t1 35.0 --label 01-mid-window-throw
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_VIDEO_ID = "Q4Dwg9Z0wZ0"
SOURCE_DIR = Path.home() / "AppData" / "Local" / "Temp" / "mga-debug-source"
DESKTOP_BASE = Path.home() / "OneDrive" / "Desktop" / "mga-frame-study"


def probe_fps(video: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=r_frame_rate",
         "-of", "default=noprint_wrappers=1:nokey=1", str(video)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    num, _, den = out.partition("/")
    return float(num) / float(den) if den else float(num)


def _scale_args(height: int) -> list[str]:
    return ["-vf", f"scale=-2:{height}"] if height > 0 else []


def extract_dense(video: Path, t0: float, t1: float, fps: float, out: Path, height: int = 0) -> list[tuple[Path, float]]:
    """One pass, every frame in [t0, t1). Map frame i (1-based) -> t0 + (i-1)/fps."""
    dur = t1 - t0
    tmp = out / "_raw"
    tmp.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-ss", f"{t0:.3f}", "-i", str(video), "-t", f"{dur:.3f}", *_scale_args(height),
         "-vsync", "0", "-q:v", "2", str(tmp / "f%05d.png")],
        check=True,
    )
    raws = sorted(tmp.glob("f*.png"))
    result: list[tuple[Path, float]] = []
    for i, raw in enumerate(raws):
        ts = t0 + i / fps
        dest = out / f"f{i + 1:05d}_t{ts:.4f}.png"
        raw.rename(dest)
        result.append((dest, ts))
    shutil.rmtree(tmp, ignore_errors=True)
    return result


def frame_stride(step: float, fps: float) -> int:
    """Frames per coarse step, or 0 when the step is not a whole number of frames."""
    n = step * fps
    return int(round(n)) if n >= 1 and abs(n - round(n)) < 1e-6 else 0


def extract_coarse(video: Path, t0: float, t1: float, step: float, fps: float, out: Path,
                   height: int = 0) -> list[tuple[Path, float]]:
    """One still every `step` seconds, labelled with the seek that reproduces it."""
    stride = frame_stride(step, fps)
    if not stride:
        return _extract_coarse_seeks(video, t0, t1, step, out, height)
    # Same count the per-still loop produces: every t0 + k*step that does not pass t1.
    n = int((t1 - t0) / step + 1e-6) + 1
    tmp = out / "_raw"
    tmp.mkdir(parents=True, exist_ok=True)
    # One continuous decode from the same single-stage seek; frame k*stride of it is the
    # first frame at or after t0 + k*step, i.e. exactly what a seek to that label returns.
    # The first decoded frame can sit up to 1/fps past t0, hence the 2-frame -t margin.
    vf = f"select='not(mod(n\\,{stride}))'" + (f",scale=-2:{height}" if height > 0 else "")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-ss", f"{t0:.3f}", "-i", str(video), "-t", f"{(n - 1) * step + 2 / fps:.3f}",
         "-vf", vf, "-vsync", "0", "-q:v", "2", str(tmp / "f%05d.png")],
        check=True,
    )
    result: list[tuple[Path, float]] = []
    for i, raw in enumerate(sorted(tmp.glob("f*.png"))[:n]):
        ts = t0 + i * step
        dest = out / f"f{i + 1:03d}_t{ts:.3f}.png"
        raw.rename(dest)
        result.append((dest, ts))
    shutil.rmtree(tmp, ignore_errors=True)
    return result


def _extract_coarse_seeks(video: Path, t0: float, t1: float, step: float, out: Path,
                          height: int) -> list[tuple[Path, float]]:
    """Fallback for strides that are not a whole number of frames: one exact seek per still."""
    result: list[tuple[Path, float]] = []
    n = int(round((t1 - t0) / step)) + 1
    for i in range(n):
        ts = t0 + i * step
        if ts > t1 + 1e-6:
            break
        dest = out / f"f{i + 1:03d}_t{ts:.3f}.png"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error",
             "-ss", f"{ts:.3f}", "-i", str(video), *_scale_args(height),
             "-frames:v", "1", "-q:v", "2", str(dest)],
            check=True,
        )
        result.append((dest, ts))
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--t0", type=float, required=True, help="window start (abs seconds)")
    ap.add_argument("--t1", type=float, required=True, help="window end (abs seconds)")
    ap.add_argument("--label", required=True, help="output subfolder name on Desktop")
    ap.add_argument("--step", type=float, default=0.0,
                    help="0 = dense (every frame). >0 = coarse stride in seconds.")
    ap.add_argument("--video", default=DEFAULT_VIDEO_ID)
    ap.add_argument("--height", type=int, default=0,
                    help="downscale output to this many px tall (survey: 720). 0 = full res.")
    args = ap.parse_args()

    video = SOURCE_DIR / f"{args.video}.mp4"
    if not video.exists():
        sys.exit(f"ERROR: cached video missing: {video}")

    fps = probe_fps(video)
    out = DESKTOP_BASE / args.label
    if out.exists():
        shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True, exist_ok=True)

    mode = "DENSE (every frame)" if args.step <= 0 else f"COARSE (every {args.step}s)"
    print(f"video={video.name}  fps={fps:.4f}  window=[{args.t0:.3f}, {args.t1:.3f}]  span={args.t1 - args.t0:.3f}s")
    print(f"mode={mode}\nout={out}")

    if args.step <= 0:
        frames = extract_dense(video, args.t0, args.t1, fps, out, args.height)
    else:
        frames = extract_coarse(video, args.t0, args.t1, args.step, fps, out, args.height)

    res = f"{args.height}p" if args.height > 0 else "full-res"
    print(f"\n{len(frames)} {res} frames:")
    print(f"  first: {frames[0][0].name}")
    print(f"  last:  {frames[-1][0].name}")
    print(f"\nOpen the folder and step through the frames:\n  {out}")


if __name__ == "__main__":
    main()
