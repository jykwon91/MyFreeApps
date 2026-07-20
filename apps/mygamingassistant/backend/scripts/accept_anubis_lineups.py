"""Auto-accept the 15 Anubis (et6AZ5a5k3I) lineups with operator-approved
derived zones + side (2026-05-31).

Mirrors ``lineup_service.accept``'s field resolution (suggested_* or existing
value, all required fields non-null after merge) then calls the repo
``accept_lineup`` directly. We skip the service wrapper ONLY to avoid its
MinIO-presign read-build (``_build_admin_read``), which is a presentation
concern irrelevant to a bulk status transition and would spuriously fail if
MinIO were down. The actual DB write path (validate -> set overrides ->
status='accepted' -> flush -> refresh relations -> commit) is identical.

Zone vocabulary (Anubis ``map_zone`` slugs, from cs2_maps.json):
  a-site b-site a-main b-main mid t-spawn ct-spawn
side: side_a = T (attacker), side_b = CT (defender), per the lineup model.

Idempotent: re-accepting an already-accepted lineup just re-sets the same
fields. ``game_id`` / ``map_id`` / ``utility_type_id`` are read from the row
(set at create time); only zones + side are supplied here.

Run via the MAIN checkout venv, cwd = backend:
  python scripts/accept_anubis_lineups.py --dry-run
  python scripts/accept_anubis_lineups.py
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

# id8 -> (stand_zone_slug, target_zone_slug, side). side_a=T, side_b=CT.
# Derived from each lineup's frame-study FROM->TO (2026-05-31). Coarse zones
# (Anubis has only 7), so these are best-fit approximations.
MAPPING: dict[str, tuple[str, str, str]] = {
    "7c2e4ddd": ("mid",      "mid",    "side_a"),  # 1  DEEP MID SMOKE        (DeepMid->Mid)
    "5b2fc963": ("mid",      "b-main", "side_a"),  # 2  MID - E BOX           (Mid->E Box/Connector)
    "0728a4eb": ("mid",      "mid",    "side_a"),  # 3  MID - TEMPLE          (Mid->Temple under Bridge)
    "7d8ce27b": ("mid",      "mid",    "side_a"),  # 4  MID - CAMERA          (Mid->Camera/Bridge)
    "c40a153a": ("ct-spawn", "mid",    "side_b"),  # 5  CT SIDE - T STAIRS    (CT/Heaven->T Stairs)  CT
    "aed96742": ("ct-spawn", "mid",    "side_b"),  # 6  CT SIDE - DEEP MID CROSS (CT->Deep Mid)     CT
    "62a21add": ("a-main",   "a-site", "side_a"),  # 7  A SITE - HEAVEN       (A Main->A Heaven)
    "64e02461": ("a-main",   "a-site", "side_a"),  # 8  A SITE - CAMERA       (A Main->Walkway/Camera)
    "fce5d2ce": ("a-main",   "a-site", "side_a"),  # 9  A SITE - PLAT         (A Main->A Plat)
    "ff8a117c": ("a-main",   "a-site", "side_a"),  # 10 A SITE FLASH          (A Main->over-A)  flash
    "dc00a42e": ("b-main",   "b-site", "side_a"),  # 11 B SITE - RIGHT SIDE SITE (B Main->B right)
    "f6769e2a": ("b-main",   "b-site", "side_a"),  # 12 B SITE - LEFT SIDE SITE  (B Main->B left)
    "06592f07": ("b-main",   "b-site", "side_a"),  # 13 B SITE - PILLAR       (B Main->Pillar)  molotov
    "db0425df": ("b-main",   "b-site", "side_a"),  # 14 B SITE - E BOX        (B Main->E Box/Connector)
    "19f96e0b": ("t-spawn",  "b-site", "side_a"),  # 15 LEFT SIDE SITE FROM SPAWN (T Spawn->B left)
}


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="resolve + validate everything, write nothing")
    args = ap.parse_args()

    async with AsyncSessionLocal() as db:
        anubis = (await db.execute(select(Map).where(Map.slug == "anubis"))).scalar_one_or_none()
        if anubis is None:
            raise SystemExit("anubis map not found — load fixtures first")
        zones = {
            z.slug: z.id
            for z in (await db.execute(
                select(MapZone).where(MapZone.map_id == anubis.id)
            )).scalars().all()
        }
        needed = {s for v in MAPPING.values() for s in v[:2]}
        missing_slugs = needed - set(zones)
        if missing_slugs:
            raise SystemExit(f"Anubis zones missing in DB: {sorted(missing_slugs)} "
                             f"(have: {sorted(zones)})")

        print(f"{'id8':8} {'title':36} {'stand':9}->{'target':8} {'side':7} status")
        print("-" * 92)
        ok, errs = 0, []
        for id8, (stand_slug, target_slug, side) in MAPPING.items():
            lid = (await db.execute(text(
                "SELECT id FROM lineup WHERE substr(id::text,1,8)=:p"
            ), {"p": id8})).scalar_one_or_none()
            if lid is None:
                errs.append(f"{id8}: lineup not found")
                continue
            lineup = (await db.execute(select(Lineup).where(Lineup.id == lid))).scalar_one()

            game_id = lineup.suggested_game_id or lineup.game_id
            map_id = lineup.suggested_map_id or lineup.map_id
            utility_type_id = lineup.suggested_utility_type_id or lineup.utility_type_id
            miss = [n for n, v in [("game_id", game_id), ("map_id", map_id),
                                   ("utility_type_id", utility_type_id)] if v is None]

            print(f"{id8:8} {lineup.title[:36]:36} {stand_slug:9}->{target_slug:8} "
                  f"{side:7} {lineup.status}" + (f"  !! MISSING {miss}" if miss else ""))
            if miss:
                errs.append(f"{id8}: missing required {miss}")
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

        print("-" * 92)
        print(f"{'DRY-RUN — no writes' if args.dry_run else f'ACCEPTED {ok}/15'}; "
              f"errors={len(errs)}")
        for e in errs:
            print(f"  ERR {e}")


asyncio.run(main())
