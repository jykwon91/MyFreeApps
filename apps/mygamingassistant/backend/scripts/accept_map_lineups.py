"""Generalized auto-accept for one map's localized+recut lineups.

Reads a per-map mapping JSON: {"<chapter_start_seconds>": [stand_zone_slug,
target_zone_slug, side], ...} where side is "side_a" (attacker/T) or "side_b"
(defender/CT). Resolves each lineup by (youtube_video_id, chapter_start_seconds),
fills required fields from suggested_* / existing, then calls the repo
accept_lineup directly (mirrors accept_sova_lineups.py — skips the service
wrapper's MinIO-presign read-build only).

Only lineups present in the mapping are accepted. Author the mapping with ONLY
gate-passed (clipped) lineups so stragglers stay pending until recovered.

Zones are COARSE best-fit approximations of each lineup's STAND->TARGET callout,
reversible on the glance board. Run via the backend venv, cwd = backend:
  python scripts/accept_map_lineups.py <map_slug> <youtube_video_id> scripts/<map>_accept.json --dry-run
  python scripts/accept_map_lineups.py <map_slug> <youtube_video_id> scripts/<map>_accept.json
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.models.game.map import Map  # noqa: E402
from app.models.game.map_zone import MapZone  # noqa: E402
from app.repositories.game.lineup.lifecycle import accept_lineup  # noqa: E402


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("map_slug")
    ap.add_argument("youtube_video_id")
    ap.add_argument("mapping_json")
    ap.add_argument("--dry-run", action="store_true",
                    help="resolve + validate everything, write nothing")
    args = ap.parse_args()

    raw = json.loads(Path(args.mapping_json).read_text(encoding="utf-8"))
    # keys may be str (JSON) -> int
    mapping: dict[int, tuple[str, str, str]] = {
        int(k): tuple(v) for k, v in raw.items()
    }

    async with AsyncSessionLocal() as db:
        amap = (await db.execute(
            select(Map).where(Map.slug == args.map_slug)
        )).scalar_one_or_none()
        if amap is None:
            raise SystemExit(f"{args.map_slug} map not found — load fixtures first")
        zones = {
            z.slug: z.id
            for z in (await db.execute(
                select(MapZone).where(MapZone.map_id == amap.id)
            )).scalars().all()
        }
        needed = {s for v in mapping.values() for s in v[:2]}
        missing_slugs = needed - set(zones)
        if missing_slugs:
            raise SystemExit(f"{args.map_slug} zones missing in DB: {sorted(missing_slugs)} "
                             f"(have: {sorted(zones)})")

        print(f"{'cs':>4} {'title':44} {'stand':10}->{'target':10} {'side':7} status")
        print("-" * 100)
        ok, errs = 0, []
        for cs in sorted(mapping):
            stand_slug, target_slug, side = mapping[cs]
            if side not in ("side_a", "side_b"):
                errs.append(f"cs={cs}: bad side {side!r}")
                continue
            lid = (await db.execute(text(
                "SELECT id FROM lineup WHERE youtube_video_id=:v AND chapter_start_seconds=:c"
            ), {"v": args.youtube_video_id, "c": cs})).scalar_one_or_none()
            if lid is None:
                errs.append(f"cs={cs}: lineup not found")
                continue
            lineup = (await db.execute(select(Lineup).where(Lineup.id == lid))).scalar_one()

            game_id = lineup.suggested_game_id or lineup.game_id
            map_id = lineup.suggested_map_id or lineup.map_id or amap.id
            utility_type_id = lineup.suggested_utility_type_id or lineup.utility_type_id
            miss = [n for n, v in [("game_id", game_id), ("utility_type_id", utility_type_id)] if v is None]

            print(f"{cs:>4} {lineup.title[:44]:44} {stand_slug:10}->{target_slug:10} "
                  f"{side:7} {lineup.status}" + (f"  !! MISSING {miss}" if miss else ""))
            if miss:
                errs.append(f"cs={cs}: missing required {miss}")
                continue
            if args.dry_run:
                continue

            overrides = {
                "game_id": game_id,
                "map_id": map_id,
                "target_zone_id": zones[target_slug],
                "stand_zone_id": zones[stand_slug],
                "side": side,
                "utility_type_id": utility_type_id,
            }
            await accept_lineup(db, lineup, overrides)
            ok += 1

        print("-" * 100)
        print(f"{'DRY-RUN — no writes' if args.dry_run else f'ACCEPTED {ok}/{len(mapping)}'}; "
              f"errors={len(errs)}")
        for e in errs:
            print(f"  ERR {e}")


asyncio.run(main())
