r"""Contact-sheet montage builder for coarse frame-study orientation.

Takes the full-res coarse stills produced by frame_study.py (named
``f<idx>_t<abs>.png``), downscales each, burns the absolute timestamp into the
top-left corner, and tiles them into grid PNGs so MANY frames can be scanned in
a single image (cheap on a model's context window vs reading 200+ full-res
stills one at a time).

This is an ORIENTATION instrument only — it locates title cards + rough event
windows. The operator/analyst then drills into exact instants with frame_study.py
dense passes at full res. Montages are intentionally lossy.

Usage (from backend dir, main checkout venv):
  .venv\Scripts\python.exe scripts\montage_study.py --src-label anubis-enum-coarse \
      --out-label anubis-enum-montage --cols 6 --rows 6 --tile-w 420
"""
import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

DESKTOP_BASE = Path.home() / "OneDrive" / "Desktop" / "mga-frame-study"
TS_RE = re.compile(r"_t([0-9.]+)\.png$")


def _match_ts(ts: str, want: set[str]) -> bool:
    """True if the frame's ts string matches any wanted ts (tolerant of trailing zeros)."""
    if ts in want:
        return True
    try:
        tv = float(ts)
    except ValueError:
        return False
    return any(abs(tv - float(w)) < 1e-3 for w in want)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src-label", required=True, help="frame_study output folder to read frames from")
    ap.add_argument("--out-label", required=True, help="output folder for montage pages")
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--rows", type=int, default=6)
    ap.add_argument("--tile-w", type=int, default=420, help="downscaled tile width (px)")
    ap.add_argument("--tile-h", type=int, default=0, help="tile height (px); 0 = derive 16:9 from tile-w")
    ap.add_argument("--crop", default="", help="crop before scale: W:H:X:Y in source px (e.g. 1400:360:580:720)")
    ap.add_argument("--only", default="", help="comma ts list to include (matches _t<ts> in filename); default all")
    args = ap.parse_args()

    src = DESKTOP_BASE / args.src_label
    if not src.exists():
        sys.exit(f"ERROR: source folder missing: {src}")
    frames = sorted(src.glob("f*.png"))
    if args.only:
        want = set(args.only.replace(" ", "").split(","))
        frames = [f for f in frames if (TS_RE.search(f.name) and _match_ts(TS_RE.search(f.name).group(1), want))]
    if not frames:
        sys.exit(f"ERROR: no frames in {src}")

    out = DESKTOP_BASE / args.out_label
    if out.exists():
        shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True, exist_ok=True)

    per_page = args.cols * args.rows
    tile_w = args.tile_w
    tile_h = args.tile_h if args.tile_h > 0 else int(round(tile_w * 9 / 16))

    pages = [frames[i:i + per_page] for i in range(0, len(frames), per_page)]
    print(f"src={src}\n{len(frames)} frames -> {len(pages)} page(s) of up to {per_page} ({args.cols}x{args.rows}), tile {tile_w}x{tile_h}")

    for pi, page in enumerate(pages):
        # Build input args + a filter graph: scale each, drawtext the ts, then hstack/vstack via tile.
        inputs: list[str] = []
        filters: list[str] = []
        for j, fr in enumerate(page):
            inputs += ["-i", str(fr)]
            # optional crop (source px) then scale + pad to uniform tile. (No
            # drawtext — this ffmpeg build lacks fontconfig. Tile order is
            # row-major; caller computes each tile's timestamp from grid pos.)
            crop = f"crop={args.crop}," if args.crop else ""
            filters.append(
                f"[{j}:v]{crop}scale={tile_w}:{tile_h}:force_original_aspect_ratio=decrease,"
                f"pad={tile_w}:{tile_h}:(ow-iw)/2:(oh-ih)/2:color=gray"
                f"[v{j}]"
            )
        n = len(page)
        labels = "".join(f"[v{j}]" for j in range(n))
        # pad the grid if last page is short by reusing tile filter's layout (xstack needs full grid; use tile)
        filters.append(f"{labels}xstack=inputs={n}:layout={_layout(n, args.cols, tile_w, tile_h)}[grid]")
        graph = ";".join(filters)
        dest = out / f"page{pi + 1:02d}.png"
        cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs,
               "-filter_complex", graph, "-map", "[grid]", "-frames:v", "1", str(dest)]
        subprocess.run(cmd, check=True)
        tss = [TS_RE.search(fr.name).group(1) for fr in page]
        print(f"  page{pi + 1:02d}.png : {n} tiles (row-major, {args.cols} wide)")
        for r in range(0, n, args.cols):
            row = tss[r:r + args.cols]
            print("      " + "  ".join(f"t{t:>7}" for t in row))

    print(f"\nout={out}")


def _layout(n: int, cols: int, tw: int, th: int) -> str:
    """xstack layout string for n tiles in a `cols`-wide grid."""
    parts = []
    for k in range(n):
        r, c = divmod(k, cols)
        x = "0" if c == 0 else "+".join(["w0"] * c)
        y = "0" if r == 0 else "+".join(["h0"] * r)
        parts.append(f"{x}_{y}")
    return "|".join(parts)


if __name__ == "__main__":
    main()
