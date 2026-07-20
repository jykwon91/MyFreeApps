"""Accept the Viper / Icebox proof lineups (source v8v1QGPSSg4, B3ast plays YT).

The 4 proof rows were created bare (utility_type_id + clips only); their inferred
target/stand callouts live in scripts/viper_icebox_spans.md. Icebox has only 7
COARSE zones (a-main a-site b-main b-site mid ct-spawn t-spawn), so the fine
callouts (A Belt / A Nest / A Screen / B Green / B Yellow) collapse to those and
the fine detail is preserved in the lineup TITLE.

Callout -> coarse-zone mapping (Icebox):
  A Belt              -> a-main   (belt is the A-main approach walkway)
  A Nest / A Screen   -> a-site   (on-site elevated structures)
  A Site default plant-> a-site
  B Green             -> b-site   (elevated near B site)
  B Yellow (plant)    -> b-site

Run (MAIN checkout venv, cwd = backend):
  .venv/Scripts/python.exe scripts/accept_viper_icebox_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/accept_viper_icebox_lineups.py
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.models.game.map import Map  # noqa: E402
from app.models.game.map_zone import MapZone  # noqa: E402
from app.models.game.utility_type import UtilityType  # noqa: E402
from app.repositories.game.lineup.lifecycle import accept_lineup  # noqa: E402

GAME_SLUG = "valorant"
MAP_SLUG = "icebox"

# id8 -> (utility_slug, target_zone_slug, stand_zone_slug, side)
MAPPING: dict[str, tuple[str, str, str, str]] = {
    "25da5aa7": ("snake-bite", "a-site", "a-main", "side_a"),  # A Default (from A Belt)
    "77f86b84": ("snake-bite", "a-site", "a-site", "side_a"),  # A Default (from A Nest)
    "438e868c": ("snake-bite", "a-site", "a-site", "side_a"),  # A Default (from A Screen)
    "637c1c33": ("snake-bite", "b-site", "b-site", "side_a"),  # B Yellow (from B Green)
}


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    async with AsyncSessionLocal() as db:
        game_id = (await db.execute(text("SELECT id FROM game WHERE slug=:s"),
                                    {"s": GAME_SLUG})).scalar_one()
        vmap = (await db.execute(select(Map).where(Map.slug == MAP_SLUG, Map.game_id == game_id))).scalar_one()
        zones = {z.slug: z.id for z in (await db.execute(
            select(MapZone).where(MapZone.map_id == vmap.id))).scalars().all()}
        utils = {u.slug: u.id for u in (await db.execute(
            select(UtilityType).where(UtilityType.game_id == game_id))).scalars().all()}

        rows = (await db.execute(select(Lineup).where(Lineup.map_id.is_(None) | (Lineup.map_id == vmap.id)))).scalars().all()
        by8 = {str(r.id)[:8]: r for r in rows}

        ok = 0
        for id8, (util, target, stand, side) in MAPPING.items():
            lineup = by8.get(id8)
            if lineup is None:
                print(f"  MISS id8={id8} — not found"); continue
            if args.dry_run:
                print(f"  WOULD-ACCEPT {id8} {util} {stand}->{target} {side} :: {lineup.title!r}")
                continue
            await accept_lineup(db, lineup, {
                "game_id": game_id, "map_id": vmap.id,
                "utility_type_id": utils[util],
                "target_zone_id": zones[target], "stand_zone_id": zones[stand], "side": side,
            })
            print(f"  ACCEPT {id8} {util} {stand}->{target} {side} :: {lineup.title!r}")
            ok += 1

        if not args.dry_run:
            await db.commit()
        print(f"DONE — accepted {ok}/{len(MAPPING)}" + (" (dry-run)" if args.dry_run else ""))


asyncio.run(main())
