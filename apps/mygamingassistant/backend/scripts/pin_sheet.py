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
between creators' capture resolutions/UI scales). It is NOT auto-derived: run
``--calibrate`` first, eyeball the emitted overlay, and record the rect in
``CALIBRATIONS`` below. A silently-wrong rect would shift every pin from that source
by a constant offset, which is exactly the kind of error that looks plausible on a
sheet, so the overlay check is mandatory before a video's first sheet.

Usage (backend cwd, app venv):
  # 1. eyeball the HUD rect for a new source video
  python scripts/pin_sheet.py calibrate --map haven --frame <a-stand-poster.webp> \
      --rect 27.5,33,229.5 --out %TEMP%/calib.png
  # 2. tile the requests into sheets
  python scripts/pin_sheet.py sheets --requests scripts/haven-pin-requests.json \
      --which stand --out %TEMP%/haven-sheets
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

_BACKEND = Path(__file__).resolve().parents[1]
_MINIMAPS = (_BACKEND.parents[0] / "frontend" / "public" / "minimaps" / "valorant")

# video_id -> (x0, y0, size, rotation_ccw_degrees) of the HUD minimap square, in
# source-frame pixels. Verified with `calibrate` — never guess a new entry.
CALIBRATIONS: dict[str, tuple[float, float, float, int]] = {
    "_VwWwoRSEcY": (21, 34, 235, 90),   # eyeballed 2026-08-22
    "czketOpD2p8": (21, 34, 235, 90),   # eyeballed 2026-08-22
}

# Haven's other four sources, fitted but NOT yet eyeballed — do not promote a row
# into CALIBRATIONS until its overlay has been looked at:
#   U7AwrJhexw8  (27, 44, 276, 90)  score 0.771, stable across frames — likely good
#   UsfCu5uL3Qs  (111, 39, 185, 90) score 0.289 — unstable, runner-up 90 px away
#   U0IlINyWPdE  (12,  0, 205, 90)  score 0.261 — unstable, hits the y=0 boundary
#   99XDk2UyO5I  ( 1, 88, 125, 90)  score 0.245 — unstable
# The three low scorers render the HUD minimap at a noticeably different size or
# position from the two calibrated sources, and some of their frames carry a
# tutorial overlay with no minimap at all, so the plate mask has little to lock
# onto. They need a per-source look before their lineups can be sheeted.

CELL = 300          # rendered size of one sheet cell, px
COLS, ROWS = 4, 3   # 12 cells per sheet — dense enough to be cheap, big enough to read


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


def _hud_plate_mask(frame: Image.Image, box: int) -> list[list[bool]]:
    """True where the HUD pixel looks like the minimap's desaturated light plate."""
    hud = frame.convert("RGB").crop((0, 0, box, box))
    px = hud.load()
    out = []
    for y in range(box):
        row = []
        for x in range(box):
            r, g, b = px[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            row.append(mx > 105 and (mx - mn) <= mx * 0.22)
        out.append(row)
    return out


def _ref_samples(map_slug: str, rotation: int, n: int = 60):
    """Sample points inside the silhouette and in a thin ring just OUTSIDE it.

    The ring, not the whole transparent margin, is what makes the fit sharp. The
    HUD plate is a filled shape, so a rect that is too SMALL still puts every
    interior sample on plate — recall alone cannot see the error and saturates at
    1.000 across a 7 px spread of rects. Ring samples sit where plate must NOT be,
    so a too-small rect pushes them onto the plate and a too-large rect pulls the
    interior samples off it. Both directions now cost score.
    """
    ref = Image.open(_MINIMAPS / f"{map_slug}.png").convert("RGBA")
    a = ref.rotate(-rotation, expand=True).split()[3].resize((n, n), Image.BILINEAR)
    solid = a.point(lambda v: 255 if v > 200 else 0)
    grown = solid.filter(ImageFilter.MaxFilter(5))
    sp, gp = solid.load(), grown.load()
    inside, ring = [], []
    for j in range(n):
        for i in range(n):
            u = ((i + 0.5) / n, (j + 0.5) / n)
            if sp[i, j]:
                inside.append(u)
            elif gp[i, j]:
                ring.append(u)
    # Thin both sets to a few hundred points: the coarse sweep evaluates ~40k
    # candidate rects, so sample count is the whole runtime.
    return _thin(inside, 380), _thin(ring, 380)


def _thin(pts: list, cap: int) -> list:
    if len(pts) <= cap:
        return pts
    step = len(pts) / cap
    return [pts[int(i * step)] for i in range(cap)]


def _score(mask, box, inside, outside, x0, y0, s):
    hit = miss = 0
    for u, v in inside:
        x, y = int(x0 + u * s), int(y0 + v * s)
        if 0 <= x < box and 0 <= y < box and mask[y][x]:
            hit += 1
    for u, v in outside:
        x, y = int(x0 + u * s), int(y0 + v * s)
        if 0 <= x < box and 0 <= y < box and mask[y][x]:
            miss += 1
    # Recall inside the silhouette, minus leak into the ring just outside it.
    return hit / max(len(inside), 1) - miss / max(len(outside), 1)


def _fit_one(path: Path, args) -> tuple[float, int, int, int]:
    """Coarse-to-fine sweep for the HUD rect: half-scale search, full-scale refine.

    The coarse pass runs on a half-resolution mask so it costs 8x less than the
    same sweep at full resolution — the rect is a few hundred px wide, so 2 px
    granularity is plenty to find the right basin; the refine pass then recovers
    the exact origin and size.
    """
    box = args.box
    frame = Image.open(path)
    inside, ring = _ref_samples(args.map, args.rotation)

    half = _hud_plate_mask(frame.resize((frame.width // 2, frame.height // 2),
                                        Image.BILINEAR), box // 2)
    hb, lo, hi = box // 2, args.min_size // 2, box // 2
    best = None
    for s in range(lo, hi + 1, 2):
        for x0 in range(0, hb - s + 1, 2):
            for y0 in range(0, hb - s + 1, 2):
                sc = _score(half, hb, inside, ring, x0, y0, s)
                if best is None or sc > best[0]:
                    best = (sc, x0, y0, s)
    _, bx, by, bs = (best[0], best[1] * 2, best[2] * 2, best[3] * 2)

    mask = _hud_plate_mask(frame, box)
    best = (_score(mask, box, inside, ring, bx, by, bs), bx, by, bs)
    for s in range(bs - 8, bs + 9):
        for x0 in range(bx - 6, bx + 7):
            for y0 in range(by - 6, by + 7):
                if s < 60 or x0 < 0 or y0 < 0 or x0 + s > box or y0 + s > box:
                    continue
                sc = _score(mask, box, inside, ring, x0, y0, s)
                if sc > best[0]:
                    best = (sc, x0, y0, s)
    return best


def cmd_autocal(args) -> None:
    """Fit the HUD rect, taking the best fit across several frames.

    The HUD minimap is semi-transparent, so bright game content behind it leaks
    into the plate mask and drags the fit. One frame is therefore not enough — a
    frame shot against a bright skybox scored 0.757 while a clean one scored
    1.000 on the SAME video, 13 px apart in origin. Scanning a handful and keeping
    the highest-scoring fit picks the frame whose background happened not to
    interfere, which is the one telling the truth about the rect.
    """
    src = Path(args.frame)
    frames = sorted(src.parent.glob("*-stand-poster.webp")) if src.is_file() else         sorted(Path(args.frame).glob("*-stand-poster.webp"))
    frames = frames[:args.scan]
    results = [(_fit_one(f, args), f.name) for f in frames]
    results.sort(key=lambda r: -r[0][0])
    (sc, x0, y0, s), name = results[0]
    vid = (src if src.is_file() else Path(args.frame)).parent.name if src.is_file()         else Path(args.frame).name
    print(f'    "{vid}": ({x0}, {y0}, {s}, {args.rotation}),'
          f'   # score {sc:.3f} on {name} ({len(frames)} frames scanned)')
    for (sc2, a, b, c), n in results[1:4]:
        print(f'    #   runner-up {sc2:.3f} ({a}, {b}, {c}) on {n}')


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
    rows = [r for r in data["requests"] if r.get(f"{args.which}_frame")]
    # Validate every source up front. Discovering a missing calibration halfway
    # through leaves a half-written sheet set that looks complete.
    missing = sorted({Path(r[f"{args.which}_frame"]).parent.name for r in rows
                      if Path(r[f"{args.which}_frame"]).parent.name not in CALIBRATIONS})
    if missing:
        raise SystemExit("no calibration for video(s): " + ", ".join(missing) +
                         "\n  run `autocal` on each and add the rect to CALIBRATIONS")
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
            cal = CALIBRATIONS[vid]
            idx = start + k
            cell = _grid(_hud_square(Image.open(path).convert("RGB"), cal), f"#{idx}")
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
    a = sub.add_parser("autocal", help="fit the HUD rect by silhouette overlap")
    a.add_argument("--map", required=True)
    a.add_argument("--frame", required=True)
    a.add_argument("--rotation", type=int, default=90)
    a.add_argument("--box", type=int, default=340, help="HUD search box, px")
    a.add_argument("--scan", type=int, default=6, help="frames to fit; best wins")
    a.add_argument("--min-size", type=int, default=100,
                   help="smallest HUD square to consider, px")
    a.set_defaults(func=cmd_autocal)
    s = sub.add_parser("sheets")
    s.add_argument("--requests", required=True)
    s.add_argument("--which", choices=("stand", "landing"), default="stand")
    s.add_argument("--out", required=True)
    s.set_defaults(func=cmd_sheets)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
