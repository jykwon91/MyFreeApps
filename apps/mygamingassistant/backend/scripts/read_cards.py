r"""Read what the FOOTAGE says about each chapter, as the ``--cards`` file build_items.py wants.

REBUILD NOTE. The original ``read_cards.py`` was one of the ~180 untracked pipeline scripts that
``git clean -fd`` deleted on 2026-07-19; recovery PR #986 restored ~80 of them and this was not
among them (``git log --all -- scripts/read_cards.py`` is empty -- it was never committed at all).
``build_items.py`` still documents and consumes its output, so the ``--cards`` half of that tool
has been dead ever since. This is a deliberate narrow rebuild, tracked this time.

SCOPE -- narrower than the original, on purpose:
  * It reads the SIDE the author prints on screen. That is the field that cannot be recovered
    downstream: build_items resolves side from the title, a measured phrase table, or the source's
    own stand partition, and ABORTS rather than guess when none of those fire.
  * It does NOT read the on-screen name plate or VALORANT's location readout. Both need OCR, and
    neither is load-bearing for the source this was rebuilt for: maxWELL's Abyss Sova guide prints
    no name plate at all, and all 30 of its chapter titles resolve a stand through the abyss
    callout table already. Emitting an OCR guess into ``name``/``stand`` would put invented text
    into the one file whose whole purpose is to say what the footage actually shows. When a source
    needs those, add them here behind real OCR -- do not fake them.

WHY SIDE LANDS IN THE ``ability`` FIELD. build_items' side tier 1b scans the card's ``ability``
(its ``plate_role``) for side words, precisely because a creator may state the side on screen
rather than in the title -- Tseeky's Sunset Fade source prints "Attacker Haunt" / "Defender Haunt"
under every name, and a title-only scan would miss it on all 27 rows. A persistent ATTACK/DEFENSE
corner label is the same thing in a different corner, so it goes down the same channel. It cannot
collide with the ability half of that field: ``ABILITY_WORDS`` matches utility names, and neither
"ATTACK" nor "DEFENSE" is one, so the ability scan finds nothing and the row correctly falls
through to the agent's a|b hedge for the localizer to settle.

METHOD. The label is a static overlay; the gameplay behind it is not. So rather than trust any one
frame -- the ATTACK label sits on red-lit geometry on this source, which is exactly the case a
single-frame colour vote gets wrong -- this samples N frames spread across the chapter and takes
the PER-PIXEL MEDIAN. Moving background averages out, the static glyphs survive, and the surviving
saturated pixels are then classified red (attack) vs teal (defense). Unanimity is not assumed: a
chapter whose median carries too few saturated pixels, or whose two counts are too close, is
reported ``unknown`` and written as no card rather than as a guess.

Usage (backend cwd, main venv -- PIL only, no numpy):
    python scripts/read_cards.py cTrav7nTu2Y <scratch>/chapters_abyss.json \
        --out <scratch>/cards_abyss.json --sheet <scratch>/cards_abyss_sheet.png
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

SOURCE_DIR = Path(tempfile.gettempdir()) / "mga-debug-source"

# Bottom-right corner label, measured on this source at 1920x1080. Overridable because it is a
# per-creator overlay position, not a game constant -- a source that puts it elsewhere passes --box.
DEFAULT_BOX = (340, 60, 1360, 1015)  # w, h, x, y

SAT = 40      # min channel-difference for a pixel to count as label-coloured rather than scenery
MIN_PX = 120  # min such pixels in the median before a verdict is trusted at all
RATIO = 2.0   # winner must beat the loser by this factor, else the chapter is ambiguous


def sample_times(cs: int, end: int, n: int) -> list[float]:
    """N timestamps spread across the middle 80% of the chapter.

    The edges are trimmed because a chapter boundary is where the creator's transition sits: the
    first and last moments of a window can still be showing the PREVIOUS lineup's overlay, which
    is the one way this measurement could pick up a neighbouring chapter's side.
    """
    lo, hi = cs + (end - cs) * 0.1, cs + (end - cs) * 0.9
    if n == 1:
        return [(lo + hi) / 2]
    return [lo + (hi - lo) * i / (n - 1) for i in range(n)]


def grab(video: Path, t: float, box: tuple[int, int, int, int], dest: Path) -> Image.Image | None:
    w, h, x, y = box
    cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(video),
           "-frames:v", "1", "-vf", f"crop={w}:{h}:{x}:{y}", "-y", str(dest)]
    if subprocess.run(cmd, capture_output=True).returncode != 0 or not dest.exists():
        return None
    return Image.open(dest).convert("RGB")


def median_image(frames: list[Image.Image]) -> Image.Image:
    """Per-pixel, per-channel median across the sampled frames.

    Works on the raw RGB buffers rather than ``getdata()`` (deprecated in Pillow 13) and indexes
    the sorted list directly rather than going through ``statistics.median``, which returns a
    float on an even sample count and would need coercing back to a byte.
    """
    raw = [f.tobytes() for f in frames]
    mid = len(raw) // 2
    med = bytes(sorted(buf[i] for buf in raw)[mid] for i in range(len(raw[0])))
    return Image.frombytes("RGB", frames[0].size, med)


def classify(img: Image.Image) -> tuple[str, int, int]:
    """(verdict, n_red, n_teal) for a median crop."""
    n_red = n_teal = 0
    buf = img.tobytes()
    for i in range(0, len(buf), 3):
        r, g, b = buf[i], buf[i + 1], buf[i + 2]
        if r - max(g, b) >= SAT:
            n_red += 1
        elif min(g, b) - r >= SAT:
            n_teal += 1
    hi, lo = max(n_red, n_teal), min(n_red, n_teal)
    if hi < MIN_PX:
        return "unknown", n_red, n_teal
    if lo and hi < lo * RATIO:
        return "ambiguous", n_red, n_teal
    return ("ATTACK" if n_red > n_teal else "DEFENSE"), n_red, n_teal


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video_id")
    ap.add_argument("chapters")
    ap.add_argument("--out", required=True)
    ap.add_argument("--samples", type=int, default=9)
    ap.add_argument("--box", help="w:h:x:y override for the label crop")
    ap.add_argument("--sheet", help="write a contact sheet of every median crop for the eyeball")
    ap.add_argument("--drop", default="", help="comma-separated chapter cs values to skip")
    a = ap.parse_args()

    box = tuple(int(v) for v in a.box.split(":")) if a.box else DEFAULT_BOX
    drop = {int(v) for v in a.drop.split(",") if v.strip()}
    doc = json.loads(Path(a.chapters).read_text(encoding="utf-8"))
    if doc.get("video_id") != a.video_id:
        raise SystemExit(f"ABORT - chapters file is for {doc.get('video_id')!r}, not {a.video_id!r}")

    video = SOURCE_DIR / f"{a.video_id}.mp4"
    if not video.exists():
        raise SystemExit(f"ABORT - {video} not cached; run download_video.py {a.video_id} first.")

    tmp = Path(tempfile.mkdtemp(prefix="mga-cards-"))
    cards, sheet_rows, unresolved = [], [], []
    try:
        for c in doc["chapters"]:
            cs, end = int(c["cs"]), int(c["end"])
            if cs in drop:
                continue
            frames = [f for f in (grab(video, t, box, tmp / f"{cs}_{i}.png")
                                  for i, t in enumerate(sample_times(cs, end, a.samples))) if f]
            if not frames:
                unresolved.append((cs, c["title"], "no frames decoded"))
                continue
            med = median_image(frames)
            verdict, n_red, n_teal = classify(med)
            print(f"{cs:>5}  {verdict:<9} red={n_red:<6} teal={n_teal:<6} {c['title']!r}")
            sheet_rows.append((cs, verdict, med, c["title"]))
            if verdict in ("ATTACK", "DEFENSE"):
                cards.append({"cs": cs, "ability": verdict})
            else:
                unresolved.append((cs, c["title"], f"{verdict} red={n_red} teal={n_teal}"))
    finally:
        for f in tmp.glob("*.png"):
            f.unlink()
        tmp.rmdir()

    if a.sheet and sheet_rows:
        w, h = sheet_rows[0][2].size
        sheet = Image.new("RGB", (w + 260, h * len(sheet_rows)), (18, 18, 18))
        d = ImageDraw.Draw(sheet)
        for i, (cs, verdict, med, title) in enumerate(sheet_rows):
            sheet.paste(med, (260, i * h))
            d.text((8, i * h + h // 2 - 6), f"{cs:>5} {verdict:<9} {title[:26]}", fill=(230, 230, 230))
        Path(a.sheet).parent.mkdir(parents=True, exist_ok=True)
        sheet.save(a.sheet)
        print(f"\n-> sheet {a.sheet}")

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(
        json.dumps({"video_id": a.video_id, "cards": cards}, indent=2), encoding="utf-8")
    print(f"-> {a.out}  ({len(cards)} cards)")

    if unresolved:
        print(f"\n!! {len(unresolved)} chapter(s) produced NO card - build_items will fall through "
              f"to its own side tiers for these, and abort if they resolve nothing:")
        for cs, title, why in unresolved:
            print(f"   cs={cs:<6} {why:<28} {title!r}")


if __name__ == "__main__":
    main()
