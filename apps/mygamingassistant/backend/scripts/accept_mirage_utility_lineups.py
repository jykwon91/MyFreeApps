"""Accept the 9 Mirage flash/molly lineups (video SGeV9W39X68) with derived
zones + side (operator OK'd 2026-05-31 to enable glance-board review).

Same shape as accept_anubis_lineups.py: mirrors lineup_service.accept's field
resolution (game/map/utility from the row), sets zones + side, then calls the
repo accept_lineup directly (skips the service's MinIO presign read-build).

Mirage map_zone slugs (cs2_maps.json): a-site b-site a-ramp a-palace b-apts
b-van mid catwalk t-spawn ct-spawn market window connector ticket-booth jungle
stairs top-mid. side_a = T (attacker), side_b = CT (defender).

Idempotent. Reversible (operator can "hide" to un-accept). Run via main venv,
cwd=backend:  python scripts/accept_mirage_utility_lineups.py [--dry-run]
"""
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
from app.repositories.game.lineup.lifecycle import accept_lineup  # noqa: E402

# id8 -> (stand_zone_slug, target_zone_slug, side). Derived from frame-study FROM→TO.
MAPPING: dict[str, tuple[str, str, str]] = {
    "f5091b69": ("a-palace", "a-site",   "side_a"),  # A Site - Site Flash (Palace Alley→A)
    "be028514": ("a-palace", "a-site",   "side_a"),  # A Firebox Molotov (Palace Interior→A crates)
    "41e5aeb7": ("ct-spawn", "a-palace", "side_b"),  # CT - A Main Molotov (CT→Palace/A Main arch)  CT
    "af132e36": ("mid",      "top-mid",  "side_a"),  # Mid - Cross Flash (Side Alley/Mid→Top Mid)
    "b62a5b2d": ("top-mid",  "window",   "side_a"),  # Top Mid - Window Molotov (→Mid Window)
    "99764d5a": ("b-apts",   "b-site",   "side_a"),  # B - Balcony Molotov (Apts→B balcony)
    "a9ef72c4": ("b-apts",   "b-site",   "side_a"),  # B - Bench Molotov (Apts→B bench)
    "4d792787": ("b-apts",   "b-site",   "side_a"),  # B Site - Site Flash (Back Alley→B)
    "bbdbfdcd": ("ct-spawn", "b-apts",   "side_b"),  # CT - Aps Door Molotov (CT→B Aps door)  CT
}


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    async with AsyncSessionLocal() as db:
        mirage = (await db.execute(select(Map).where(Map.slug == "mirage"))).scalar_one_or_none()
        if mirage is None:
            raise SystemExit("mirage map not found")
        zones = {z.slug: z.id for z in (await db.execute(
            select(MapZone).where(MapZone.map_id == mirage.id))).scalars().all()}
        needed = {s for v in MAPPING.values() for s in v[:2]}
        missing = needed - set(zones)
        if missing:
            raise SystemExit(f"Mirage zones missing: {sorted(missing)} (have {sorted(zones)})")

        print(f"{'id8':8} {'title':30} {'stand':9}->{'target':8} {'side':7} status")
        print("-" * 86)
        ok, errs = 0, []
        for id8, (stand_slug, target_slug, side) in MAPPING.items():
            lid = (await db.execute(text(
                "SELECT id FROM lineup WHERE substr(id::text,1,8)=:p"), {"p": id8})).scalar_one_or_none()
            if lid is None:
                errs.append(f"{id8}: not found"); continue
            lineup = (await db.execute(select(Lineup).where(Lineup.id == lid))).scalar_one()
            game_id = lineup.suggested_game_id or lineup.game_id
            map_id = lineup.suggested_map_id or lineup.map_id
            utility_type_id = lineup.suggested_utility_type_id or lineup.utility_type_id
            miss = [n for n, v in [("game_id", game_id), ("map_id", map_id),
                                   ("utility_type_id", utility_type_id)] if v is None]
            print(f"{id8:8} {lineup.title[:30]:30} {stand_slug:9}->{target_slug:8} {side:7} "
                  f"{lineup.status}" + (f"  !! MISSING {miss}" if miss else ""))
            if miss:
                errs.append(f"{id8}: missing {miss}"); continue
            if args.dry_run:
                continue
            await accept_lineup(db, lineup, {
                "game_id": game_id, "map_id": map_id,
                "target_zone_id": zones[target_slug], "stand_zone_id": zones[stand_slug],
                "side": side, "utility_type_id": utility_type_id})
            ok += 1
        print("-" * 86)
        print(f"{'DRY-RUN — no writes' if args.dry_run else f'ACCEPTED {ok}/9'}; errors={len(errs)}")
        for e in errs:
            print(f"  ERR {e}")


asyncio.run(main())
