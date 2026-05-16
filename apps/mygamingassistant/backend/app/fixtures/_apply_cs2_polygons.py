"""Inject approximate seed zone polygons into cs2_maps.json.

Coordinates are normalized 0-1 over the FULL radar PNG (incl. transparent
margin) — the minimap fills the square SVG viewBox, origin top-left. These are
SEED polygons: centroids land in the correct callout region so lineup pins
appear in the right area. Edges are approximate and meant to be refined via the
operator polygon editor (#656). Anchored to the in-game bombsite (orange) /
spawn (green) markers visible on each radar + standard CS2 north-up layouts.

Re-runnable: overwrites polygon_points for every (map, zone) listed below.
Run:  python -m app.fixtures._apply_cs2_polygons
"""
import json
from pathlib import Path

_F = Path(__file__).with_name("cs2_maps.json")


def _rect(x0, y0, x1, y1):
    return [
        {"x": x0, "y": y0},
        {"x": x1, "y": y0},
        {"x": x1, "y": y1},
        {"x": x0, "y": y1},
    ]


def _poly(*pts):
    return [{"x": x, "y": y} for x, y in pts]


POLYGONS: dict[str, dict[str, list]] = {
    "mirage": {
        "a-site": _poly((0.17, 0.22), (0.31, 0.22), (0.32, 0.34), (0.16, 0.35)),
        "a-palace": _rect(0.29, 0.34, 0.41, 0.47),
        "a-ramp": _rect(0.14, 0.43, 0.28, 0.58),
        "catwalk": _rect(0.40, 0.36, 0.53, 0.49),
        "mid": _rect(0.46, 0.49, 0.59, 0.69),
        "b-site": _rect(0.27, 0.55, 0.42, 0.70),
        "b-van": _rect(0.27, 0.54, 0.35, 0.62),
        "b-apts": _rect(0.26, 0.68, 0.41, 0.80),
        "t-spawn": _rect(0.42, 0.76, 0.60, 0.87),
        "ct-spawn": _rect(0.78, 0.30, 0.92, 0.45),
    },
    "inferno": {
        "a-site": _rect(0.43, 0.17, 0.57, 0.30),
        "b-site": _rect(0.74, 0.61, 0.88, 0.75),
        "a-long": _rect(0.59, 0.24, 0.72, 0.38),
        "banana": _poly((0.22, 0.42), (0.36, 0.45), (0.34, 0.58), (0.21, 0.55)),
        "mid": _rect(0.43, 0.43, 0.57, 0.57),
        "second-mid": _rect(0.44, 0.33, 0.56, 0.43),
        "t-spawn": _rect(0.27, 0.74, 0.45, 0.87),
        "ct-spawn": _rect(0.82, 0.29, 0.94, 0.44),
    },
    "dust2": {
        "b-site": _rect(0.09, 0.06, 0.25, 0.21),
        "a-site": _rect(0.70, 0.08, 0.87, 0.25),
        "a-long": _rect(0.71, 0.27, 0.86, 0.55),
        "a-short": _rect(0.55, 0.22, 0.69, 0.40),
        "b-tunnels": _rect(0.10, 0.45, 0.28, 0.66),
        "mid": _rect(0.40, 0.30, 0.56, 0.62),
        "catwalk": _rect(0.52, 0.43, 0.66, 0.58),
        "t-spawn": _rect(0.30, 0.83, 0.52, 0.95),
        "ct-spawn": _rect(0.55, 0.62, 0.71, 0.76),
    },
    "overpass": {
        "b-site": _rect(0.38, 0.13, 0.54, 0.28),
        "a-site": _rect(0.54, 0.54, 0.71, 0.71),
        "a-long": _rect(0.66, 0.45, 0.80, 0.66),
        "b-monster": _rect(0.22, 0.32, 0.38, 0.50),
        "mid": _rect(0.40, 0.36, 0.55, 0.55),
        "canal": _rect(0.14, 0.54, 0.31, 0.72),
        "t-spawn": _rect(0.58, 0.80, 0.74, 0.93),
        "ct-spawn": _rect(0.42, 0.05, 0.58, 0.16),
    },
    "nuke": {
        "upper-a": _rect(0.50, 0.42, 0.67, 0.57),
        "lower-b": _rect(0.49, 0.57, 0.64, 0.70),
        "a-ramp": _rect(0.62, 0.48, 0.72, 0.63),
        "outside": _rect(0.72, 0.40, 0.93, 0.60),
        "lobby": _rect(0.33, 0.49, 0.48, 0.62),
        "t-spawn": _rect(0.07, 0.48, 0.24, 0.62),
        "ct-spawn": _rect(0.49, 0.26, 0.64, 0.40),
    },
    "anubis": {
        "a-site": _rect(0.65, 0.20, 0.80, 0.35),
        "b-site": _rect(0.23, 0.43, 0.38, 0.57),
        "a-main": _rect(0.58, 0.46, 0.73, 0.64),
        "b-main": _rect(0.27, 0.58, 0.42, 0.74),
        "mid": _rect(0.43, 0.42, 0.57, 0.58),
        "t-spawn": _rect(0.40, 0.76, 0.57, 0.88),
        "ct-spawn": _rect(0.37, 0.13, 0.54, 0.27),
    },
    "ancient": {
        "a-site": _rect(0.71, 0.34, 0.86, 0.50),
        "b-site": _rect(0.16, 0.18, 0.31, 0.33),
        "a-main": _rect(0.58, 0.50, 0.74, 0.66),
        "b-main": _rect(0.16, 0.37, 0.32, 0.55),
        "mid": _rect(0.40, 0.42, 0.56, 0.60),
        "t-spawn": _rect(0.38, 0.74, 0.55, 0.87),
        "ct-spawn": _rect(0.34, 0.20, 0.51, 0.34),
    },
    "vertigo": {
        "a-site": _rect(0.13, 0.17, 0.28, 0.32),
        "b-site": _rect(0.64, 0.51, 0.80, 0.66),
        "a-ramp": _rect(0.14, 0.46, 0.30, 0.64),
        "mid": _rect(0.37, 0.37, 0.53, 0.55),
        "t-spawn": _rect(0.30, 0.72, 0.47, 0.85),
        "ct-spawn": _rect(0.47, 0.15, 0.63, 0.30),
    },
}


def main() -> None:
    data = json.loads(_F.read_text(encoding="utf-8"))
    applied = 0
    missing = []
    for entry in data:
        if entry.get("game_slug") != "cs2":
            continue
        for m in entry["maps"]:
            table = POLYGONS.get(m["slug"], {})
            seen = set()
            for z in m["zones"]:
                if z["slug"] in table:
                    z["polygon_points"] = table[z["slug"]]
                    seen.add(z["slug"])
                    applied += 1
                else:
                    missing.append(f'{m["slug"]}/{z["slug"]}')
            extra = set(table) - seen
            if extra:
                missing.append(f'{m["slug"]} UNUSED {sorted(extra)}')
    _F.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"applied polygons: {applied}")
    if missing:
        print("UNMATCHED:", *missing, sep="\n  ")


if __name__ == "__main__":
    main()
