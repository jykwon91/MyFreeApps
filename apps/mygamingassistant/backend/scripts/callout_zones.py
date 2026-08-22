"""Project Riot's own callout coordinates onto a map's seeded zone boxes.

Rebuild of the tool the Sunset/Breeze recipe used (referenced in the header of
``lineup_callouts.BREEZE_CALLOUTS``); the original was lost in the 2026-07-19
``git clean -fd`` and never recovered, so it is tracked here.

``valorant-api.com`` serves, per map, Riot's callout list in world coordinates
plus the four multipliers that project them onto the exact radar PNG bundled in
``frontend/public/minimaps/valorant/``:

    nx = game.y * xMultiplier + xScalarToAdd
    ny = game.x * yMultiplier + yScalarToAdd        # note the x/y swap

For every callout this prints the projected point, the zone box it lands in (or
the nearest one) and the edge distance in normalized units. A callout INSIDE a
box is settled. A small distance is a strong hint. A large distance means the
geometry decides nothing and the mapping has to come from map knowledge or the
sources' own vocabulary -- say so in the table's comment rather than pretending
the number chose.

Usage (backend cwd, main venv):
    python scripts/callout_zones.py abyss
    python scripts/callout_zones.py abyss --json      # machine-readable
"""
from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

_FIXTURE = Path(__file__).resolve().parents[1] / "app" / "fixtures" / "valorant_maps.json"
_API = "https://valorant-api.com/v1/maps"


def _zone_boxes(map_slug: str) -> dict[str, tuple[float, float, float, float]]:
    for entry in json.loads(_FIXTURE.read_text(encoding="utf-8")):
        for m in entry.get("maps", []):
            if m["slug"] != map_slug:
                continue
            out = {}
            for z in m.get("zones", []):
                xs = [p["x"] for p in z["polygon_points"]]
                ys = [p["y"] for p in z["polygon_points"]]
                out[z["slug"]] = (min(xs), min(ys), max(xs), max(ys))
            return out
    raise SystemExit(f"map {map_slug!r} not in {_FIXTURE.name}")


def _riot_map(map_slug: str) -> dict:
    with urllib.request.urlopen(_API, timeout=30) as r:
        data = json.load(r)["data"]
    for m in data:
        if (m.get("displayName") or "").lower().replace(" ", "-") == map_slug:
            return m
    raise SystemExit(f"map {map_slug!r} not served by valorant-api")


def _edge_distance(px: float, py: float, box: tuple[float, float, float, float]) -> float:
    x0, y0, x1, y1 = box
    dx = max(x0 - px, 0.0, px - x1)
    dy = max(y0 - py, 0.0, py - y1)
    return (dx * dx + dy * dy) ** 0.5


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("map_slug")
    ap.add_argument("--json", action="store_true", dest="as_json")
    args = ap.parse_args()

    boxes = _zone_boxes(args.map_slug)
    m = _riot_map(args.map_slug)
    xm, ym = m["xMultiplier"], m["yMultiplier"]
    xa, ya = m["xScalarToAdd"], m["yScalarToAdd"]

    rows = []
    for c in m.get("callouts") or []:
        loc = c["location"]
        nx = loc["y"] * xm + xa
        ny = loc["x"] * ym + ya
        ranked = sorted(
            ((_edge_distance(nx, ny, b), s) for s, b in boxes.items()),
        )
        d, best = ranked[0]
        rows.append({
            "callout": f"{c['superRegionName']} {c['regionName']}".strip(),
            "nx": round(nx, 4), "ny": round(ny, 4),
            "zone": best, "distance": round(d, 4),
            "inside": d == 0.0,
            "runner_up": ranked[1][1] if len(ranked) > 1 else None,
            "runner_up_distance": round(ranked[1][0], 4) if len(ranked) > 1 else None,
        })
    rows.sort(key=lambda r: (r["distance"], r["callout"]))

    if args.as_json:
        print(json.dumps(rows, indent=2))
        return
    print(f"== {args.map_slug} : {len(rows)} Riot callouts vs {len(boxes)} seeded zones ==")
    print(f"{'callout':22s} {'nx':>7s} {'ny':>7s}  {'zone':10s} {'dist':>7s}  runner-up")
    print("-" * 78)
    for r in rows:
        mark = "INSIDE " if r["inside"] else f"{r['distance']:7.3f}"
        print(f"{r['callout']:22s} {r['nx']:7.3f} {r['ny']:7.3f}  {r['zone']:10s} {mark}  "
              f"{r['runner_up']} @ {r['runner_up_distance']}")


if __name__ == "__main__":
    main()
