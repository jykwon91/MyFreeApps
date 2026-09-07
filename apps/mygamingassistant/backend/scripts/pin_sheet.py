r"""Build minimap CONTACT SHEETS so the pin localizer reads many lineups per image.

`propose_pins.py extract` hands the vision step a full 1280x720 gameplay frame per
lineup. Almost all of that frame is irrelevant to a minimap pin: the signal lives in
the HUD minimap in the top-left corner plus the callout text above it. Cropping to
just that corner, rotating it into the REFERENCE minimap's orientation, and tiling N
of them into one labelled sheet turns "read 102 frames" into "read 9 sheets", and it
reads more accurately because the crop is upscaled instead of shrunk.

Why the rotation: Valorant renders the HUD minimap fixed-orientation but rotated
relative to the radar asset we ship (on Haven the HUD reads C-B-A left-to-right while
the reference reads A-B-C top-to-bottom). Rotating the crop by the source's
``rotation`` makes a sheet cell geometrically identical to the reference, so a pin
read off the cell's overlaid 0.1 grid IS the reference-normalized pin — no mental
transform, no axis-swap mistakes.

Calibration is per SOURCE VIDEO (the HUD rect is fixed for a whole video, and differs
between creators' capture resolutions/UI scales). It lives in ``hud-calibrations.json``
next to this script, fitted by ``fit_hud_rect.py``, and only sources that file marks
``ok`` are sheetable. A silently-wrong rect shifts every pin from that source by a
constant offset — the kind of error that looks perfectly plausible on the sheet — so
``sheets`` refuses to tile a source whose rect the fitter could not corroborate
across frames rather than emitting cells nobody can tell are wrong.

Usage (backend cwd):
  # 1. fit every source of a map (needs numpy; see fit_hud_rect.py)
  uv run --with pillow --with numpy scripts/fit_hud_rect.py --map haven \
      --posters %TEMP%/mga-pin-posters/haven
  # 2. settle anything it marked `eyeball`, then record the result in the json
  python scripts/pin_sheet.py calibrate --map haven --frame <a-stand-poster.webp> \
      --rect 22,35,232 --out %TEMP%/calib.png
  # 3. tile the requests into sheets
  python scripts/pin_sheet.py sheets --requests scripts/haven-pin-requests.json \
      --which stand --out %TEMP%/haven-sheets
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

_BACKEND = Path(__file__).resolve().parents[1]
_MINIMAPS = (_BACKEND.parents[0] / "frontend" / "public" / "minimaps" / "valorant")

# video_id -> {"rect": [x0, y0, size, rotation_ccw_degrees], "verdict": ...} for the
# HUD minimap square, in source-frame pixels. Written by fit_hud_rect.py.
CALIBRATION_FILE = Path(__file__).resolve().parent / "hud-calibrations.json"

CELL = 300          # rendered size of one sheet cell, px
COLS, ROWS = 4, 3   # 12 cells per sheet — dense enough to be cheap, big enough to read


def _calibrations() -> dict[str, dict]:
    if not CALIBRATION_FILE.is_file():
        raise SystemExit(f"no {CALIBRATION_FILE.name} — run fit_hud_rect.py first")
    return json.loads(CALIBRATION_FILE.read_text(encoding="utf-8"))


def _hud_square(frame: Image.Image, cal: tuple[float, float, float, int]) -> Image.Image:
    x0, y0, s, rot = cal
    sq = frame.crop((int(round(x0)), int(round(y0)),
                     int(round(x0 + s)), int(round(y0 + s))))
    return sq.rotate(rot, expand=True) if rot else sq


def _grid(img: Image.Image, label: str) -> Image.Image:
    """Overlay a 0.1 reference-normalized grid + the cell's index label."""
    out = img.convert("RGB").resize((CELL, CELL), Image.LANCZOS)
    d = ImageDraw.Draw(out)
    for i in range(1, 10):
        t = i * CELL / 10
        col = (0, 210, 255) if i == 5 else (0, 130, 160)
        d.line([(t, 0), (t, CELL)], fill=col)
        d.line([(0, t), (CELL, t)], fill=col)
    d.rectangle([0, 0, CELL - 1, CELL - 1], outline=(255, 255, 0))
    d.rectangle([2, 2, 92, 20], fill=(0, 0, 0))
    d.text((6, 6), label, fill=(255, 255, 0))
    return out


def cmd_calibrate(args) -> None:
    x0, y0, s = (float(v) for v in args.rect.split(","))
    frame = Image.open(args.frame).convert("RGBA")
    n = int(round(s))
    ref = Image.open(_MINIMAPS / f"{args.map}.png").convert("RGBA")
    ref = ref.rotate(-args.rotation, expand=True).resize((n, n), Image.LANCZOS)
    tint = Image.new("RGBA", ref.size, (255, 0, 0, 0))
    tint.putalpha(ref.split()[3].point(lambda v: 120 if v > 40 else 0))
    over = frame.copy()
    over.alpha_composite(tint, (int(round(x0)), int(round(y0))))
    d = ImageDraw.Draw(over)
    d.rectangle([x0, y0, x0 + s, y0 + s], outline=(0, 255, 0, 255))
    box = int(round(max(x0 + s, y0 + s))) + 20
    over.crop((0, 0, box, box)).resize((900, 900), Image.LANCZOS).convert("RGB").save(args.out)
    print(f"wrote {args.out} — the red silhouette must sit ON the HUD map, not beside it")


def cmd_sheets(args) -> None:
    data = json.loads(Path(args.requests).read_text(encoding="utf-8"))
    cal = _calibrations()
    rows = [r for r in data["requests"] if r.get(f"{args.which}_frame")]

    # Resolve every source's calibration up front. Discovering a missing or
    # untrustworthy one halfway through leaves a half-written sheet set that looks
    # complete, and a sheet built from a bad rect is worse than no sheet: its cells
    # are readable, plausible, and uniformly wrong.
    def _usable(vid: str) -> bool:
        row = cal.get(vid)
        return bool(row) and (row.get("verdict") == "ok" or row.get("eyeballed"))

    seen = {Path(r[f"{args.which}_frame"]).parent.name for r in rows}
    unusable = sorted(v for v in seen if not _usable(v))
    if unusable and not args.skip_uncalibrated:
        detail = "\n".join(
            f"    {v}: {cal.get(v, {}).get('verdict', 'not fitted')}"
            f" (score {cal.get(v, {}).get('score', '-')},"
            f" agree {cal.get(v, {}).get('agree', '-')})" for v in unusable)
        raise SystemExit(
            f"{len(unusable)} source(s) have no usable HUD calibration:\n{detail}\n"
            "  fit them:  uv run --with pillow --with numpy scripts/fit_hud_rect.py"
            f" --map <map> --posters <posters>\n"
            "  settle an `eyeball` with `pin_sheet.py calibrate`, then add an"
            ' "eyeballed" note to its row\n'
            "  or pass --skip-uncalibrated to sheet only the sources that are ready")
    if unusable:
        print("skipping uncalibrated source(s): " + ", ".join(unusable))
        rows = [r for r in rows
                if _usable(Path(r[f"{args.which}_frame"]).parent.name)]
    if not rows:
        raise SystemExit("nothing left to sheet")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    per = COLS * ROWS
    manifest = []
    for start in range(0, len(rows), per):
        chunk = rows[start:start + per]
        sheet = Image.new("RGB", (COLS * CELL, ROWS * CELL), (18, 18, 18))
        for k, r in enumerate(chunk):
            path = Path(r[f"{args.which}_frame"])
            vid = path.parent.name
            rect = cal[vid]["rect"]
            idx = start + k
            cell = _grid(_hud_square(Image.open(path).convert("RGB"), rect), f"#{idx}")
            sheet.paste(cell, ((k % COLS) * CELL, (k // COLS) * CELL))
            manifest.append({"index": idx, "lineup_id": r["lineup_id"],
                             "title": r["title"], "video": vid,
                             "stand_zone": r["stand_zone_slug"],
                             "target_zone": r["target_zone_slug"]})
        name = out_dir / f"{args.which}-{start:03d}.png"
        sheet.save(name)
        print(f"{name}  cells {start}..{start + len(chunk) - 1}")
    (out_dir / f"{args.which}-manifest.json").write_text(
        json.dumps(manifest, indent=1), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("calibrate")
    c.add_argument("--map", required=True)
    c.add_argument("--frame", required=True)
    c.add_argument("--rect", required=True, help="x0,y0,size in source-frame px")
    c.add_argument("--rotation", type=int, default=90, help="CCW degrees HUD->reference")
    c.add_argument("--out", required=True)
    c.set_defaults(func=cmd_calibrate)
    s = sub.add_parser("sheets")
    s.add_argument("--requests", required=True)
    s.add_argument("--which", choices=("stand", "landing"), default="stand")
    s.add_argument("--out", required=True)
    s.add_argument("--skip-uncalibrated", action="store_true",
                   help="sheet the ready sources instead of refusing outright")
    s.set_defaults(func=cmd_sheets)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
