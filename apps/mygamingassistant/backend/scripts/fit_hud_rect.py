r"""Fit each source video's HUD-minimap rect by gradient cross-correlation.

``pin_sheet.py`` needs, per source video, the square of source-frame pixels the HUD
minimap occupies. Every pin read off a contact sheet is normalized against that
square, so a wrong rect shifts an entire video's pins by a constant offset — the
failure mode that looks plausible on the sheet and stays invisible until someone
opens the board.

The first fitter matched a *filled plate mask*: "which rect puts the reference
silhouette's interior on desaturated-light HUD pixels". That works only when the
HUD draws the whole map onto a bright plate. It fit garbage whenever

* the minimap is circle-clipped, so part of the silhouette has no plate to land
  on (Haven ``99XDk2UyO5I``: scored 0.597 for a rect 7% too small),
* the plate is dim, or bright scenery leaks through the semi-transparent HUD
  (``UsfCu5uL3Qs``, ``U0IlINyWPdE``: ~0.26 with runners-up 90 px away — the score
  surface had no peak at all).

This fitter matches STRUCTURE instead of fill: the map's wall edges. It correlates
the HUD's signed image gradient against the reference minimap's, so it keys on
where walls are rather than on how bright the plate is. Clipped-away regions
contribute nothing instead of dragging the rect toward the visible part, and a dim
plate has the same edges as a bright one.

Scoring, per candidate (x0, y0, s), is a masked cosine similarity:

    num = Σ T_gx·I_gx + Σ T_gy·I_gy       over the template's alpha
    den = ‖T‖ · sqrt(Σ M·(I_gx² + I_gy²))
    score = |num| / den                    ∈ [0, 1]

``|num|`` rather than ``num`` so a source rendering the map dark-on-light instead
of light-on-dark (a global gradient-polarity flip) still peaks. Every offset for
one scale comes from three FFT correlations, so a sweep is seconds rather than the
minutes an explicit loop costs.

## Trust the agreement, not the score

The HUD rect is fixed for a whole video, so every frame of one source must fit the
SAME rect. Cross-frame agreement, not the score, is what gates a promotion — a raw
score cannot be compared across sources, because a circle-clipped minimap leaves
most of the template with nothing to match and so scores *below* sources this
fitter gets outright wrong:

    _VwWwoRSEcY  0.715  unanimous              correct (eyeballed)
    czketOpD2p8  0.714  unanimous              correct (eyeballed)
    U7AwrJhexw8  0.713  unanimous              correct (eyeballed)
    99XDk2UyO5I  0.284  one informative frame  correct (eyeballed), clipped
    UsfCu5uL3Qs  0.158  scattered ~100 px      WRONG — full-screen tactical map
    U0IlINyWPdE  0.152  scattered ~100 px      WRONG — player-follow minimap

Only frames scoring within ``INFORMATIVE`` of the source's best get a vote; the
rest saw no minimap at all and fit noise. Then:

* every voter agrees, and there are at least two  -> ``ok``
* only one informative frame, or a split vote     -> ``eyeball``
* voters scatter                                  -> ``unsupported``

``eyeball`` means run ``pin_sheet.py calibrate`` and look at the overlay before
that source's lineups are sheeted. Record the result by adding ``"eyeballed":
"<what you saw, dated>"`` to its row in the calibration file — a later re-fit
carries the note forward and keeps the ``ok``, and shouts if the rect has moved
out from under it.

## What this fitter cannot do

Some creators run the minimap in **player-follow** mode: it rotates with the
player's view, so there is no per-video rotation and no fixed rect — the transform
changes every frame. Others read pins off the full-screen tactical map, which is
also rotated and far outside the HUD corner. Both show up here as "fits, but no
two frames agree", and both are recorded ``verdict: "unsupported"`` rather than
guessed at. Placing them needs per-frame rotation-invariant patch matching
(localize the visible minimap patch *inside* the reference), which is a different
tool; until it exists their lineups get no auto-proposed pin.

Needs numpy, which the app does NOT depend on — this is operator tooling, not
runtime code, so run it in a throwaway env instead of adding a backend dep:

  uv run --with pillow --with numpy scripts/fit_hud_rect.py \
      --map haven --posters %TEMP%/mga-pin-posters/haven

That fits every source under the map's poster tree and merges the results into
``scripts/hud-calibrations.json``, which ``pin_sheet.py sheets`` reads.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

_BACKEND = Path(__file__).resolve().parents[1]
_MINIMAPS = _BACKEND.parents[0] / "frontend" / "public" / "minimaps"
CALIBRATION_FILE = Path(__file__).resolve().parent / "hud-calibrations.json"

# Two fits count as the same rect if origin and size agree within this many source
# pixels. 3 px on a ~250 px rect is ~1% of the map — below the precision anyone
# reads a pin off a contact sheet at, and above the jitter a semi-transparent HUD
# induces between frames.
AGREE_TOL = 3

# Only frames scoring at least this fraction of the source's best get a vote. Many
# posters simply have no minimap drawn — a tutorial overlay covers it, or the frame
# is mid-fade — and those fit pure noise. Counting them sank two sources whose rect
# was independently confirmed correct (99XDk2UyO5I at 1/8, U7AwrJhexw8 at 5/8), so
# the vote is among frames that actually saw a minimap.
INFORMATIVE = 0.6


def _sobel(a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Signed x/y gradients. Central differences — cheap and enough here."""
    gx = np.zeros_like(a)
    gy = np.zeros_like(a)
    gx[:, 1:-1] = a[:, 2:] - a[:, :-2]
    gy[1:-1, :] = a[2:, :] - a[:-2, :]
    return gx, gy


def _corr(img_f: np.ndarray, tpl: np.ndarray, shape: tuple[int, int],
          n: int) -> np.ndarray:
    """Correlate a pre-transformed image with `tpl`, keeping valid offsets only.

    `img_f` is rfft2(image) at size n; correlation is conjugate multiplication,
    done here by pre-flipping the template. Result [y, x] scores placing the
    template's origin at (x, y).
    """
    t = np.zeros((n, n), dtype=np.float64)
    t[:tpl.shape[0], :tpl.shape[1]] = tpl[::-1, ::-1]
    full = np.fft.irfft2(img_f * np.fft.rfft2(t), s=(n, n))
    off_y, off_x = tpl.shape[0] - 1, tpl.shape[1] - 1
    return full[off_y:off_y + shape[0], off_x:off_x + shape[1]]


def _reference(map_slug: str, game: str, rotation: int) -> tuple[np.ndarray, np.ndarray]:
    path = _MINIMAPS / game / f"{map_slug}.png"
    if not path.is_file():
        raise SystemExit(f"no reference minimap at {path}")
    ref = Image.open(path).convert("RGBA").rotate(-rotation, expand=True)
    # The sheet cell and the pin normalization both assume a square. Every shipped
    # reference is one; guard rather than silently skew a whole map's pins.
    if abs(ref.width - ref.height) > 2:
        raise SystemExit(f"reference {path.name} is not square: {ref.size}")
    gray = np.asarray(ref.convert("L"), dtype=np.float64)
    solid = np.asarray(ref.split()[3], dtype=np.float64) > 127
    return gray * solid, solid.astype(np.float64)


def _fit_frame(frame: Image.Image, ref_gray: np.ndarray, ref_mask: np.ndarray,
               box: int, lo: int, hi: int, step: int) -> tuple[float, int, int, int]:
    hud = np.asarray(frame.convert("L").crop((0, 0, box, box)), dtype=np.float64)
    igx, igy = _sobel(hud)

    n = 1
    while n < box * 2:
        n *= 2
    fgx, fgy = np.fft.rfft2(igx, s=(n, n)), np.fft.rfft2(igy, s=(n, n))
    fen = np.fft.rfft2(igx ** 2 + igy ** 2, s=(n, n))

    ref_img = Image.fromarray(ref_gray.astype(np.uint8))
    ref_msk = Image.fromarray((ref_mask * 255).astype(np.uint8))

    best = (-1.0, 0, 0, 0)
    for s in range(lo, hi + 1, step):
        shape = (box - s + 1, box - s + 1)
        if shape[0] <= 0:
            break
        t = np.asarray(ref_img.resize((s, s), Image.BILINEAR), dtype=np.float64)
        m = (np.asarray(ref_msk.resize((s, s), Image.BILINEAR)) > 127).astype(np.float64)
        tgx, tgy = _sobel(t * m)
        tgx *= m
        tgy *= m
        tnorm = float(np.sqrt((tgx ** 2 + tgy ** 2).sum()))
        if tnorm < 1e-6:
            continue
        num = _corr(fgx, tgx, shape, n) + _corr(fgy, tgy, shape, n)
        den = np.sqrt(np.maximum(_corr(fen, m, shape, n), 1e-9)) * tnorm
        score = np.abs(num) / den
        y0, x0 = np.unravel_index(int(np.argmax(score)), score.shape)
        if score[y0, x0] > best[0]:
            best = (float(score[y0, x0]), int(x0), int(y0), s)
    return best


def _fit_source(frames: list[Path], ref_gray, ref_mask, args) -> dict:
    results = []
    for f in frames:
        # Coarse sweep on even scales, then refine +-3 px around the winner: the
        # coarse pass can land one step off the true size, and 2 px of size error
        # is ~1% of the rect — enough to matter at the map's edges.
        coarse = _fit_frame(Image.open(f), ref_gray, ref_mask, args.box,
                            args.min_size, args.box, 2)
        fine = _fit_frame(Image.open(f), ref_gray, ref_mask, args.box,
                          max(args.min_size, coarse[3] - 3), coarse[3] + 3, 1)
        results.append((max(coarse, fine), f.name))
    results.sort(key=lambda r: -r[0][0])

    (sc, x0, y0, s), name = results[0]
    voters = [r for r in results if r[0][0] >= sc * INFORMATIVE]
    agree = sum(1 for (_, a, b, c), _ in voters
                if max(abs(a - x0), abs(b - y0), abs(c - s)) <= AGREE_TOL)
    if len(voters) < 2:
        # One informative frame cannot corroborate itself. The rect may well be
        # right — 99XDk2UyO5I's was — but nothing here says so.
        verdict = "eyeball"
    elif agree == len(voters):
        verdict = "ok"
    elif agree >= 2 and agree * 2 >= len(voters):
        verdict = "eyeball"
    else:
        verdict = "unsupported"
    return {"rect": [x0, y0, s, args.rotation], "score": round(sc, 4),
            "agree": f"{agree}/{len(voters)}", "verdict": verdict,
            "map": args.map, "game": args.game, "frame": name,
            "frames_scanned": len(results),
            "runners_up": [{"score": round(s2, 4), "rect": [a, b, c]}
                           for (s2, a, b, c), _ in results[1:4]]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--map", required=True)
    ap.add_argument("--game", default="valorant")
    ap.add_argument("--posters", required=True,
                    help="the map's poster root (fits every source under it), "
                         "or one source's poster dir")
    ap.add_argument("--rotation", type=int, default=90,
                    help="CCW degrees taking the HUD minimap to the reference")
    ap.add_argument("--box", type=int, default=340, help="HUD search box, px")
    ap.add_argument("--scan", type=int, default=14,
                    help="frames to fit per source; more helps when many posters "
                         "have no minimap drawn")
    ap.add_argument("--min-size", type=int, default=110)
    ap.add_argument("--only", help="fit just this video id")
    ap.add_argument("--out", default=str(CALIBRATION_FILE))
    ap.add_argument("--dry-run", action="store_true", help="print, don't write")
    args = ap.parse_args()

    root = Path(args.posters)
    dirs = ([root] if any(root.glob("*-stand-poster.webp"))
            else sorted(d for d in root.rglob("*") if d.is_dir()
                        and any(d.glob("*-stand-poster.webp"))))
    if args.only:
        dirs = [d for d in dirs if d.name == args.only]
    if not dirs:
        raise SystemExit(f"no source dir with *-stand-poster.webp under {root}")

    ref_gray, ref_mask = _reference(args.map, args.game, args.rotation)
    out = Path(args.out)
    rows = json.loads(out.read_text(encoding="utf-8")) if out.is_file() else {}

    for d in dirs:
        frames = sorted(d.glob("*-stand-poster.webp"))[:args.scan]
        row = _fit_source(frames, ref_gray, ref_mask, args)
        # A human overlay check outranks the fitter, so carry `eyeballed` forward
        # across re-fits — otherwise re-running the tool silently demotes a source
        # somebody already confirmed. If the rect MOVED, the note no longer
        # describes what is in the file: say so instead of inheriting the blessing.
        prior = rows.get(d.name, {})
        if note := prior.get("eyeballed"):
            px, py, ps, _ = prior["rect"]
            x0, y0, s, _ = row["rect"]
            if max(abs(px - x0), abs(py - y0), abs(ps - s)) <= AGREE_TOL:
                row["eyeballed"], row["verdict"] = note, "ok"
            else:
                row["eyeballed_stale"] = f"was {prior['rect']} — {note}"
                print(f"  !! {d.name}: refit moved an eyeballed rect "
                      f"{prior['rect']} -> {row['rect']}; re-check the overlay")
        rows[d.name] = row
        x0, y0, s, rot = row["rect"]
        print(f'{d.name:14} ({x0:3}, {y0:3}, {s:3}, {rot})  score {row["score"]:.3f}'
              f'  agree {row["agree"]:>5}  {row["verdict"].upper()}'
              f'{"  (eyeballed)" if row.get("eyeballed") else ""}')

    if args.dry_run:
        return
    out.write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"\nwrote {out}")
    eyeball = [k for k, v in rows.items() if v.get("verdict") == "eyeball"]
    if eyeball:
        print("eyeball before sheeting: " + ", ".join(eyeball) +
              "\n  pin_sheet.py calibrate --map <map> --frame <a poster> "
              "--rect x0,y0,s --out overlay.png")


if __name__ == "__main__":
    main()
