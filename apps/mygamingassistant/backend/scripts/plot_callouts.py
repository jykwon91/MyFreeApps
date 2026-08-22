r"""Render a map's seeded zone boxes + Riot's projected callouts over its radar.

The LOOK step of the callout recipe (see ``callout_zones.py``). A projected
cloud that is shifted or mirrored is obvious in one glance and invisible in a
table of distances, so never author a callout table from the numbers alone.

Usage (backend cwd, main venv):
    python scripts/plot_callouts.py abyss
    python scripts/plot_callouts.py abyss --out C:\some\where\abyss.png
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

_ROOT = Path(__file__).resolve().parents[2]
_FIXTURE = _ROOT / "backend" / "app" / "fixtures" / "valorant_maps.json"
_MINIMAPS = _ROOT / "frontend" / "public" / "minimaps" / "valorant"

_PALETTE = [
    (220, 60, 60), (60, 120, 220), (230, 140, 60), (80, 180, 200), (200, 90, 160),
    (90, 190, 120), (240, 200, 60), (160, 60, 220), (60, 200, 160), (150, 150, 90),
]


def _zones(map_slug: str):
    for entry in json.loads(_FIXTURE.read_text(encoding="utf-8")):
        for m in entry.get("maps", []):
            if m["slug"] == map_slug:
                return m["zones"]
    raise SystemExit(f"map {map_slug!r} not in {_FIXTURE.name}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("map_slug")
    ap.add_argument("--out")
    args = ap.parse_args()

    png = _MINIMAPS / f"{args.map_slug}.png"
    if not png.exists():
        raise SystemExit(f"no bundled radar at {png}")

    raw = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("callout_zones.py")),
         args.map_slug, "--json"],
        capture_output=True, text=True, check=True,
    ).stdout
    callouts = json.loads(raw)

    im = Image.open(png).convert("RGBA")
    W, H = im.size
    canvas = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    canvas.alpha_composite(im)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    for i, z in enumerate(_zones(args.map_slug)):
        c = _PALETTE[i % len(_PALETTE)]
        xs = [p["x"] for p in z["polygon_points"]]
        ys = [p["y"] for p in z["polygon_points"]]
        d.rectangle([min(xs) * W, min(ys) * H, max(xs) * W, max(ys) * H],
                    fill=c + (55,), outline=c + (255,), width=4)
        d.text((min(xs) * W + 8, min(ys) * H + 6), z["slug"], fill=(0, 0, 0, 255))

    for c in callouts:
        x, y = c["nx"] * W, c["ny"] * H
        d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(0, 0, 0, 255))
        d.text((x + 9, y - 6), c["callout"], fill=(0, 0, 0, 255))

    canvas.alpha_composite(layer)
    out = Path(args.out) if args.out else Path(tempfile.gettempdir()) / f"{args.map_slug}-callouts.png"
    canvas.convert("RGB").save(out)
    print(out)


if __name__ == "__main__":
    main()
