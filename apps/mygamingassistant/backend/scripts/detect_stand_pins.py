r"""Detect the STAND pin directly from the HUD minimap's player marker.

A lineup's STAND pin is "where the player stood when they threw" -- and the HUD
minimap draws exactly that, as the player's own marker. So the stand pin does not
need a vision read at all: find the marker in the calibrated HUD square, normalize
by the square, and that IS the reference-normalized pin. Deterministic, free, and
repeatable, where a localizer read of a contact sheet costs a model call per twelve
lineups and lands wherever the reader's eye lands.

(TARGET pins are a different problem and this tool does not touch them. The minimap
marks the player, never where utility lands, so a target still needs the landing
frame -- see ``propose_pins.py apply --target-fallback``.)

## Finding the marker

The marker renders as a small DARK disc with a bright ring on the light map plate.
Matching that shape directly does not work: the map's own site letters -- the A, B
and C stamped on each site plate -- are also dark blobs ringed by bright plate, at
the same size, and they beat the player on contrast. A first pass scoring
"dark disc, bright in every direction" put 63 of 75 Haven pins on a site letter.
Colour does not separate them either; the HUD is desaturated enough that marker and
glyph differ by ~10 levels of saturation, and the only real colour in the square is
scenery bleeding through the semi-transparent HUD.

What separates them is time. Every static thing in the HUD square -- the map, the
plates, the letters -- is the same across a source's frames, and the player marker
is the one thing that moves. So the background is the **median** of the registered
square over all a source's stand frames, and the marker is what differs from it:

    diff  = frame - background
    diff -= blur(diff, wide)              drop what scenery bleed explains
    score = ring_mean(diff) - core_mean(diff)

The high-pass matters because the HUD is semi-transparent: bright scenery behind it
shifts whole regions frame to frame, which is a much larger raw difference than a
7 px marker. Subtracting a wide blur keeps only what is too small and sharp for
scenery to account for.

The score is **centre-surround**: the mean of an annulus at ring radius minus the
mean of the disc inside it, both on the high-passed difference. That peaks at the
marker's centre, which is the thing being asked for. The obvious alternative --
``sqrt(blur(max(diff,0)) * blur(max(-diff,0)))``, "both signs inside one marker
width" -- also finds the marker, but it peaks where the bright ring meets the dark
core rather than in the middle, biasing every pin about 13 px up-left on a 1024 px
reference. Verified across all 53 Haven detections: same marker, better centre.

Radii scale with the HUD rect, since a creator's UI scale sets both. A source needs
several stand frames for the median to be a background at all; below
``MIN_BG_FRAMES`` the marker would survive into it and cancel itself out.

## Registering every frame, not every source

A source's HUD rect is only fixed if that creator runs the minimap in fixed-map
mode. Plenty do not: the minimap pans and zooms to follow the player, so the map
sits somewhere different in the HUD every frame. Detecting against a per-source
rect then compares a frame to a background it is not aligned with, and the marker
is looked for in the wrong place entirely -- which is what the first working
version did, and why a third of Haven's detections landed on scenery.

So each frame is registered on its own, by re-running ``fit_hud_rect``'s gradient
fit against that single frame, seeded to scales near the source's rect so the
search stays cheap. Frames are then resampled to a common size, which puts every
square in the same geometry -- and only then does the median mean anything, because
a median over unregistered frames blurs the map itself into the background.

A frame whose own fit is weak (``--min-fit``) had no readable minimap -- a tutorial
overlay, a fade -- and is dropped rather than detected against a rect that does not
describe it.

## What validates a detection, and what does NOT

The honest check is visual, and it is cheap because a STAND frame contains exactly
one marker: ``--audit`` writes a contact sheet of every detection zoomed on its own
neighbourhood, and either the marker is under the circle or it is not. On Haven
that is **51 of 53**. The two misses are frames with no legible marker; their score
sits mid-pack, so no threshold separates them -- run the audit, or run
``propose_pins.py render``, before shipping a map's pins.

Two checks that look like validation and are NOT, both tried on Haven:

* **Distance from the declared ``stand_zone_slug``.** The pack's zone polygons are
  small nominal boxes (Haven's are 0.08-0.14 across) marking roughly where a zone
  is, not covering it. A perfectly correct pin anywhere in the real A Site lands
  0.1-0.2 from the ``a-site`` box, so "only 5 of 53 inside their zone" measures the
  placeholder, not the pin. It is reported below as a coarse outlier screen only.
* **Agreement between the STAND and LANDING frames.** Tempting -- the creator holds
  still while the utility flies, so their marker should not move. But the landing
  frame's most salient marker is the *arrow*, sitting inside its green reveal
  circle, not the player. The two positions are supposed to differ; 0 of 51
  agreeing says nothing about the detector.

Needs numpy -- operator tooling, not runtime code, so run it in a throwaway env:

  uv run --with pillow --with numpy scripts/detect_stand_pins.py \
      --map haven --requests scripts/haven-pin-requests.json --audit
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import fit_hud_rect

_BACKEND = Path(__file__).resolve().parents[1]
_PACK = _BACKEND / "data" / "lineup_library.json"
_MINIMAPS = _BACKEND.parents[0] / "frontend" / "public" / "minimaps"
CALIBRATION_FILE = Path(__file__).resolve().parent / "hud-calibrations.json"

# The rect the radii below were tuned against; every radius scales from it so a
# creator running a larger UI scale gets proportionally larger ones.
REF_RECT = 232.0
R_CORE, R_RING = 2.0, 4.5   # marker core and its bright ring, in REF_RECT px
R_WIDE = 16.0               # high-pass radius: wider than any marker, narrower
                            # than the regions scenery bleed shifts
MARGIN = 0.06               # ignore the square's own border, where registration
                            # resampling leaves edge artefacts
MIN_BG_FRAMES = 6           # below this the marker survives into the median
REG_SIZE = 232              # common geometry every frame is resampled to
SCALE_SLACK = 0.25          # per-frame scale search around the source's rect


def _hud_square(frame: Image.Image, rect) -> Image.Image:
    x0, y0, s, rot = rect
    sq = frame.crop((int(round(x0)), int(round(y0)),
                     int(round(x0 + s)), int(round(y0 + s))))
    return sq.rotate(rot, expand=True) if rot else sq


def _blur(a: np.ndarray, radius: float) -> np.ndarray:
    """Mean over a (2r+1)^2 box. A square is close enough to a disc at these sizes
    and costs two cumulative sums instead of a per-pixel loop."""
    k = max(1, int(round(radius)))
    p = np.pad(a, k, mode="edge")
    ii = np.zeros((p.shape[0] + 1, p.shape[1] + 1), dtype=np.float64)
    ii[1:, 1:] = p.cumsum(0).cumsum(1)
    h, w = a.shape
    d = 2 * k + 1
    s = (ii[d:d + h, d:d + w] - ii[0:h, d:d + w]
         - ii[d:d + h, 0:w] + ii[0:h, 0:w])
    return s / float(d * d)


def _box_area(radius: float) -> int:
    return (2 * max(1, int(round(radius))) + 1) ** 2


def _gray(sq: Image.Image) -> np.ndarray:
    return np.asarray(sq.convert("L"), dtype=np.float64)


def _register(frame_path: Path, ref_gray: np.ndarray, ref_mask: np.ndarray,
              source_rect, args) -> np.ndarray | None:
    """Fit THIS frame's own HUD rect and return its square at REG_SIZE.

    Seeded to scales near the source's rect: a creator's UI scale barely moves
    even when the minimap pans, so searching the full range again would cost most
    of the runtime to rediscover the same size.
    """
    frame = Image.open(frame_path)
    s0 = float(source_rect[2])
    lo = max(40, int(s0 * (1.0 - SCALE_SLACK)))
    hi = int(s0 * (1.0 + SCALE_SLACK))
    coarse = fit_hud_rect._fit_frame(frame, ref_gray, ref_mask, args.box, lo, hi, 2)
    fine = fit_hud_rect._fit_frame(frame, ref_gray, ref_mask, args.box,
                                   max(lo, coarse[3] - 3), coarse[3] + 3, 1)
    score, x0, y0, s = max(coarse, fine)
    if score < args.min_fit:
        return None
    sq = _hud_square(frame.convert("RGB"), (x0, y0, s, source_rect[3]))
    return _gray(sq.resize((REG_SIZE, REG_SIZE), Image.BILINEAR))


def _playable_mask(map_slug: str, game: str, n: int) -> np.ndarray:
    """True where the reference minimap draws map -- i.e. where a player can be.

    The HUD is semi-transparent, so bright scenery behind it moves frame to frame
    just like the marker does and reads as a large sharp difference. Most of that
    lands OFF the map silhouette, where a player provably cannot stand, so the
    silhouette is a free and exact veto. The square is already rotated into the
    reference's orientation, so the reference's own alpha applies directly.
    """
    path = _MINIMAPS / game / f"{map_slug}.png"
    if not path.is_file():
        raise SystemExit(f"no reference minimap at {path}")
    alpha = Image.open(path).convert("RGBA").split()[3].resize((n, n), Image.BILINEAR)
    return np.asarray(alpha) > 127


def _detect(a: np.ndarray, bg: np.ndarray, scale: float,
            playable: np.ndarray) -> tuple[float, float, float]:
    """Return (x, y, score) normalized to the square, for the best marker centre."""
    n = a.shape[0]
    diff = a - bg
    diff -= _blur(diff, R_WIDE * scale)          # drop what scenery bleed explains

    core = _blur(diff, R_CORE * scale)
    wide = _blur(diff, R_RING * scale)
    ac, aw = _box_area(R_CORE * scale), _box_area(R_RING * scale)
    ring = (wide * aw - core * ac) / max(aw - ac, 1)
    # Bright ring against dark core, measured AT the centre rather than at the
    # boundary between them -- see the module docstring on why the boundary form
    # finds the same marker but off-centre.
    score = ring - core

    m = int(n * MARGIN)
    score[:m, :] = score[-m:, :] = score[:, :m] = score[:, -m:] = -1e9
    score = np.where(playable, score, -1e9)
    y, x = np.unravel_index(int(np.argmax(score)), score.shape)
    return (x + 0.5) / n, (y + 0.5) / n, float(score[y, x])


def _zone_boxes(game: str, map_slug: str) -> dict[str, tuple[float, float, float, float]]:
    pack = json.loads(_PACK.read_text(encoding="utf-8"))
    out = {}
    for z in pack["zones"]:
        if z.get("game_slug") != game or z.get("map_slug") != map_slug:
            continue
        pts = z.get("polygon_points") or []
        if not pts:
            continue
        xs = [p["x"] for p in pts]
        ys = [p["y"] for p in pts]
        out[z["zone_slug"]] = (min(xs), min(ys), max(xs), max(ys))
    return out


def _zone_dist(pt: tuple[float, float], box) -> float:
    """0 inside the box, else the straight-line distance to its edge."""
    x, y = pt
    x0, y0, x1, y1 = box
    dx = max(x0 - x, 0.0, x - x1)
    dy = max(y0 - y, 0.0, y - y1)
    return math.hypot(dx, dy)


def _audit_sheet(cells: list, out: Path) -> None:
    """One zoomed crop per detection, circled. The only honest accuracy check."""
    r, zoom, cols = 20, 4, 9
    w = r * 2 * zoom
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * (w + 16)), (18, 18, 18))
    label = ImageDraw.Draw(sheet)
    for k, (a, x, y, score, title) in enumerate(cells):
        n = a.shape[0]
        cx, cy = int(x * n), int(y * n)
        x0 = max(0, min(n - 2 * r, cx - r))
        y0 = max(0, min(n - 2 * r, cy - r))
        crop = np.clip(a[y0:y0 + 2 * r, x0:x0 + 2 * r], 0, 255).astype(np.uint8)
        img = Image.fromarray(crop).convert("RGB").resize((w, w), Image.NEAREST)
        d = ImageDraw.Draw(img)
        px, py = (cx - x0) * zoom, (cy - y0) * zoom
        d.ellipse([px - 9, py - 9, px + 9, py + 9], outline=(255, 60, 60), width=2)
        ox, oy = (k % cols) * w, (k // cols) * (w + 16)
        sheet.paste(img, (ox, oy))
        label.text((ox + 3, oy + w + 2), f"#{k} {title[:18]} s={score:.0f}",
                   fill=(235, 235, 120))
    sheet.save(out)
    print(f"\naudit sheet -> {out}\n  every circle must sit on the marker; a STAND "
          f"frame has exactly one, so a miss is obvious")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--map", required=True)
    ap.add_argument("--game", default="valorant")
    ap.add_argument("--requests", required=True)
    ap.add_argument("--out", help="proposals json (default <map>-pin-proposals.json)")
    ap.add_argument("--max-zone-dist", type=float, default=0.35,
                    help="coarse outlier screen only -- the pack's zone polygons "
                         "are small nominal boxes, so this cannot measure accuracy")
    ap.add_argument("--min-score", type=float, default=15.0,
                    help="drop a detection whose marker contrast is below this "
                         "(does NOT separate the known misses -- run --audit)")
    ap.add_argument("--rotation", type=int,
                    help="CCW degrees taking the HUD minimap to the reference. "
                         "Defaults to whatever fit_hud_rect recorded for these "
                         "sources -- pass it only to override, and note that a "
                         "value disagreeing with the calibration means detecting "
                         "against a rect fitted under different geometry")
    ap.add_argument("--box", type=int, default=340)
    ap.add_argument("--min-fit", type=float, default=0.35,
                    help="drop a frame whose own HUD fit scores below this "
                         "-- it had no readable minimap")
    ap.add_argument("--audit", metavar="PNG", nargs="?", const="auto",
                    help="write the zoomed detection contact sheet")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cal = json.loads(CALIBRATION_FILE.read_text(encoding="utf-8"))
    reqs = json.loads(Path(args.requests).read_text(encoding="utf-8"))["requests"]
    boxes = _zone_boxes(args.game, args.map)

    # Group by source: the background median is per video, and it is the whole
    # reason this works, so a source that cannot produce one is skipped outright
    # rather than detected against a background of one frame (itself).
    by_video: dict[str, list[dict]] = {}
    skipped = 0
    for r in reqs:
        frame = r.get("stand_frame")
        row = cal.get(Path(frame).parent.name, {}) if frame else {}
        usable = row.get("rect") and (row.get("verdict") == "ok"
                                      or row.get("eyeballed"))
        if not frame or not usable:
            skipped += 1
            continue
        by_video.setdefault(Path(frame).parent.name, []).append(r)

    # Rotation is per SOURCE -- creators fix the minimap's orientation differently,
    # so one map's sources legitimately disagree (Summit: 0 and 90 in one batch).
    # fit_hud_rect resolved each one and stored it in that rect's 4th slot; read it
    # back rather than defaulting, or a frame gets registered against different
    # geometry than its rect was fitted under and simply lands somewhere wrong,
    # silently. One reference per distinct rotation, built once and shared.
    if not by_video:
        raise SystemExit("no calibrated source for this map -- run fit_hud_rect first")
    refs = {}
    for v in by_video:
        rot = args.rotation if args.rotation is not None else cal[v]["rect"][3]
        if rot not in refs:
            refs[rot] = fit_hud_rect._reference(args.map, args.game, rot)
    playable = _playable_mask(args.map, args.game, REG_SIZE)

    proposals, dropped, dists, cells, weak = [], [], [], [], 0
    for vid, group in sorted(by_video.items()):
        rect = cal[vid]["rect"]
        ref_gray, ref_mask = refs[args.rotation if args.rotation is not None
                                  else rect[3]]
        squares: dict[str, np.ndarray] = {}
        for r in group:
            fit = _register(Path(r["stand_frame"]), ref_gray, ref_mask, rect, args)
            if fit is None:
                weak += 1
                continue
            squares[r["lineup_id"]] = fit
        if len(squares) < MIN_BG_FRAMES:
            print(f"  {vid}: only {len(squares)} registered frame(s), "
                  f"need {MIN_BG_FRAMES} for a background -- skipped")
            skipped += len(group)
            continue
        bg = np.median(np.stack(list(squares.values())), axis=0)

        for r in group:
            a = squares.get(r["lineup_id"])
            if a is None:
                continue
            x, y, score = _detect(a, bg, REG_SIZE / REF_RECT, playable)
            box = boxes.get(r.get("stand_zone_slug"))
            dist = _zone_dist((x, y), box) if box else None
            cells.append((a, x, y, score, r["title"]))

            rec = {"lineup_id": r["lineup_id"], "title": r["title"], "video": vid,
                   "stand_zone": r.get("stand_zone_slug"), "score": round(score, 1),
                   "zone_dist": None if dist is None else round(dist, 3),
                   "x": round(x, 4), "y": round(y, 4)}
            if dist is not None:
                dists.append(dist)
            if score < args.min_score or (dist is not None
                                          and dist > args.max_zone_dist):
                dropped.append(rec)
                continue
            proposals.append({
                "lineup_id": r["lineup_id"],
                "stand": {"x": rec["x"], "y": rec["y"], "confidence": "med",
                          "reasoning": f"player marker detected on the HUD minimap "
                                       f"(contrast {rec['score']}, "
                                       f"{rec['zone_dist']} from "
                                       f"{rec['stand_zone']})"},
            })

    print(f"{len(proposals)} detected  {len(dropped)} dropped  {weak} unregistered  "
          f"{skipped} skipped (no stand frame or no usable calibration)")
    if dropped:
        print("\ndropped:")
        for d in sorted(dropped, key=lambda d: -(d["zone_dist"] or 0))[:20]:
            print(f'  {d["title"][:34]:34} {str(d["stand_zone"]):10} '
                  f'score {d["score"]:6} dist {d["zone_dist"]}')
    if dists:
        # Reported because a detection way outside even a nominal zone box is worth
        # eyeballing -- NOT as an accuracy figure. The boxes are placeholders; see
        # the module docstring.
        edges = [0.0, 0.05, 0.12, 0.20, 0.35, 1.5]
        print("\ndistance from the declared stand zone's NOMINAL box "
              "(outlier screen, not accuracy):")
        for lo, hi in zip(edges, edges[1:]):
            n = sum(1 for d in dists if lo <= d < hi)
            print(f"  {lo:4.2f}-{hi:4.2f}  {n:4}  {'#' * min(n, 60)}")

    if args.audit and cells:
        out = (Path(args.requests).parent / f"{args.map}-pin-audit.png"
               if args.audit == "auto" else Path(args.audit))
        _audit_sheet(cells, out)

    if args.dry_run:
        return
    out = Path(args.out) if args.out else (
        Path(args.requests).parent / f"{args.map}-pin-proposals.json")
    out.write_text(json.dumps(proposals, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
