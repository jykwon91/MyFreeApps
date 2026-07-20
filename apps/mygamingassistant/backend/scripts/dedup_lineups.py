"""Cross-video geometric dedup for MGA lineups (multi-source backfill initiative).

The problem: a map×agent bucket is ingested from MULTIPLE tutorial videos, so the
same physical lineup (same utility, thrown from the same spot to the same target)
shows up more than once. We want only UNIQUE lineups in the app, keeping the ONE
with the clearest STAND/AIM/THROW/LANDING clip.

Dedup rule (operator decision 2026-07-20 — STRICT geometric):
    two lineups are the SAME iff
        same game_slug, map_slug, utility_type_slug, side
        AND stand anchors within EPS  (normalized minimap distance)
        AND target anchors within EPS
    Technique (jump vs standing, L vs R click) is IGNORED — same spot = one lineup.

This needs fine minimap positions (stand_anchor_*/target_anchor_*). Lineups whose
anchors are still null (never pinned) CANNOT be geometrically deduped — they are
reported separately as NEEDS_PINS so the operator populates them via
MinimapPinEditor first. We deliberately do NOT collapse on coarse zone alone: the
KAY/O Ascent bucket has 4 distinct fragment lineups sharing (a-main→a-site,side_a),
so zone-pair is not a uniqueness key.

Usage:
    python scripts/dedup_lineups.py <lineups.json> [--eps 0.045] [--json out.json]

Input: a JSON list of lineup dicts (the pack's `lineups`, or a candidate set), each
with at least: id, game_slug, map_slug, utility_type_slug, side,
stand_anchor_x/y, target_anchor_x/y, youtube_video_id, and the four *_clip_url
fields (used only to rank which duplicate to KEEP).

Output (stdout, human-readable; --json for machine): duplicate groups with a
recommended keeper + drops, and the NEEDS_PINS list.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict

# Default match radius in normalized minimap units (0..1 on each axis). ~0.045 is
# a few percent of the minimap — tight enough to separate adjacent stands, loose
# enough to absorb the small placement variance between two creators pinning the
# same physical spot. Tune per map if needed.
DEFAULT_EPS = 0.045

_CLIP_FIELDS = ("stand_clip_url", "aim_clip_url", "throw_clip_url", "landing_clip_url")
_ANCHOR_FIELDS = ("stand_anchor_x", "stand_anchor_y", "target_anchor_x", "target_anchor_y")


def _has_pins(l: dict) -> bool:
    return all(l.get(k) is not None for k in _ANCHOR_FIELDS)


def _dist(ax, ay, bx, by) -> float:
    return math.hypot(ax - bx, ay - by)


def _same_spot(a: dict, b: dict, eps: float) -> bool:
    """Strict geometric equality: stand AND target both within eps."""
    stand = _dist(a["stand_anchor_x"], a["stand_anchor_y"],
                  b["stand_anchor_x"], b["stand_anchor_y"])
    target = _dist(a["target_anchor_x"], a["target_anchor_y"],
                   b["target_anchor_x"], b["target_anchor_y"])
    return stand <= eps and target <= eps


def _clip_score(l: dict) -> tuple:
    """Rank a lineup as a keeper: more of the 4 micro-clips present is better;
    tie-break on having a landing clip (the money shot), then aim, then a stable
    id so the choice is deterministic. Operator makes the final call in review."""
    present = sum(1 for f in _CLIP_FIELDS if l.get(f))
    return (present, bool(l.get("landing_clip_url")), bool(l.get("aim_clip_url")),
            str(l.get("id")))


def dedup(lineups: list[dict], eps: float = DEFAULT_EPS) -> dict:
    """Return {'groups': [...], 'needs_pins': [...], 'unique_count': int}.

    Only lineups WITH pins are geometrically clustered. Each cluster of >1 is a
    duplicate group with a recommended keeper (best clip score) + drops.
    """
    pinned = [l for l in lineups if _has_pins(l)]
    needs_pins = [l for l in lineups if not _has_pins(l)]

    # Bucket by the exact-match dimensions, then cluster geometrically within.
    buckets: dict[tuple, list[dict]] = defaultdict(list)
    for l in pinned:
        key = (l.get("game_slug"), l.get("map_slug"),
               l.get("utility_type_slug"), l.get("side"))
        buckets[key].append(l)

    groups = []
    unique = 0
    for key, items in buckets.items():
        # Union-find over "same spot" adjacency.
        parent = list(range(len(items)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if _same_spot(items[i], items[j], eps):
                    parent[find(i)] = find(j)

        clusters: dict[int, list[dict]] = defaultdict(list)
        for idx, l in enumerate(items):
            clusters[find(idx)].append(l)

        for cluster in clusters.values():
            unique += 1
            if len(cluster) > 1:
                ranked = sorted(cluster, key=_clip_score, reverse=True)
                groups.append({
                    "key": key,
                    "keep": ranked[0],
                    "drop": ranked[1:],
                })

    return {"groups": groups, "needs_pins": needs_pins, "unique_count": unique}


def _fmt(l: dict) -> str:
    clips = "".join(c[0].upper() if l.get(f) else "." for c, f in
                    zip(("s", "a", "t", "l"), _CLIP_FIELDS))
    return (f"{str(l.get('id'))[:8]}  vid={l.get('youtube_video_id')}  "
            f"{l.get('utility_type_slug')}/{l.get('side')}  "
            f"stand=({l.get('stand_anchor_x')},{l.get('stand_anchor_y')}) "
            f"clips=[{clips}]")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("lineups", help="pack json (dict with 'lineups') or a raw list")
    ap.add_argument("--eps", type=float, default=DEFAULT_EPS)
    ap.add_argument("--json", dest="out", help="write machine-readable result here")
    ap.add_argument("--map", help="restrict to this map_slug")
    ap.add_argument("--game", help="restrict to this game_slug")
    args = ap.parse_args()

    data = json.load(open(args.lineups, encoding="utf-8"))
    lineups = data.get("lineups") if isinstance(data, dict) else data
    if args.game:
        lineups = [l for l in lineups if l.get("game_slug") == args.game]
    if args.map:
        lineups = [l for l in lineups if l.get("map_slug") == args.map]

    result = dedup(lineups, eps=args.eps)

    print(f"input lineups: {len(lineups)}  eps={args.eps}")
    print(f"unique (geometric): {result['unique_count']}  "
          f"duplicate groups: {len(result['groups'])}  "
          f"needs pins: {len(result['needs_pins'])}")
    for g in result["groups"]:
        print(f"\nDUP {g['key']}")
        print(f"  KEEP  {_fmt(g['keep'])}")
        for d in g["drop"]:
            print(f"  drop  {_fmt(d)}")
    if result["needs_pins"]:
        print(f"\n{len(result['needs_pins'])} lineups have no pins yet — populate "
              f"stand+target anchors (MinimapPinEditor) before they can be deduped.")

    if args.out:
        slim = {
            "unique_count": result["unique_count"],
            "groups": [{"key": list(g["key"]),
                        "keep": g["keep"].get("id"),
                        "drop": [d.get("id") for d in g["drop"]]}
                       for g in result["groups"]],
            "needs_pins": [l.get("id") for l in result["needs_pins"]],
        }
        json.dump(slim, open(args.out, "w", encoding="utf-8"), indent=2)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
