"""Auto-accept the 19 Cache (6DduFLHu7zM, NartOutHere) lineups with
operator-approved derived zones + side (2026-06-01).

Mirrors ``accept_anubis_lineups.py`` exactly: resolves each lineup's required
fields (suggested_* or existing value, all non-null after merge) then calls the
repo ``accept_lineup`` directly, skipping the service wrapper ONLY to avoid its
MinIO-presign read-build (``_build_admin_read``) — a presentation concern
irrelevant to a bulk status transition. The DB write path (validate -> set
overrides -> status='accepted' -> flush -> refresh relations -> commit) is
identical.

Zone vocabulary (Cache ``map_zone`` slugs, from cs2_maps.json):
  a-site b-site mid a-main b-main vents sun-room squeaky highway checkers
  t-spawn ct-spawn
On the radar: A site = TOP, B site = BOTTOM, mid = center, a-main = right,
b-main = left. side: side_a = T (attacker execute), side_b = CT (defender/retake).

Zones are COARSE best-fit approximations (reversible post-accept on the glance
board). Two flags from STATE were resolved here:
  * A-Cross courtyard (6ba60fd2/96144c18/2536d287/3c40df31/b1e4fddb) -> a-site
    target (the "block A Cross" / Tree family all land at the A site). 7ba223c8
    "A Cross Waterfall Smoke" is the DISTINCT alt to 96144c18 (SAME A-site
    result, different Long-A/Highway stand) -> a-site target, highway stand.
  * 85b7fdcb "B Utility Combo": the chapter is a 3-util B execute, but the
    SMOKE we localized is actually a Tree smoke FROM SUN ROOM (radar "Sun Room";
    on-screen card "Tree smoke, HS Molotov, B Flash") -> target a-site (Tree),
    stand sun-room. Name/zone mismatch is intentional; operator eyeball/rename.

Idempotent: re-accepting an already-accepted lineup just re-sets the same
fields. ``game_id`` / ``map_id`` / ``utility_type_id`` are read from the row
(set at create time); only zones + side are supplied here.

Run via the MAIN checkout venv, cwd = backend:
  python scripts/accept_cache_lineups.py --dry-run
  python scripts/accept_cache_lineups.py
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
from app.models.game.utility_type import UtilityType  # noqa: E402
from app.repositories.game.lineup.lifecycle import accept_lineup  # noqa: E402

# id8 -> (stand_zone_slug, target_zone_slug, side, utility_slug_override).
# side_a=T, side_b=CT. utility override is None to keep the row's stored utility
# (smoke) or a slug ("molotov") to RE-TYPE the row at accept.
#
# RE-DERIVED 2026-07-16 from the dense frame-study RE-LOCALIZATION (see
# scripts/cache_spans.md). The original 2026-06-01 zones were coarse best-fit and
# the clips were mis-localized; this pass replaces both. Zones/side are the
# localizer-verified STAND->TARGET readings (radar callouts + destination).
# Zones with no fixture slug were mapped to the nearest: Connector->vents,
# Garage-callout->a-main, Heaven->b-site, T-Yard/Bus-Stop->highway/a-main.
#
# Operator-flagged at eyeball (2026-07-16):
#   * 85b7fdcb "B Utility Combo"  -> RE-TYPED smoke->MOLOTOV (its smoke duplicated
#     0a747b59 Tree From Sunroom; the chapter's distinct utility is the molotov).
#   * db24c221 "Heaven From Sunroom" -> RE-TYPED smoke->MOLOTOV (localizer found
#     green bottle + orange fire; stored "smoke" was wrong).
#   * 2536d287 "Fast A Cross": WEAK — source never films the release or bloom.
#   * 76a20ed1 "Garage": LOW — footage is a Connector->A-garage boost-combo, not
#     the stored "B Main->B site"; landing off-cam. Zones best-effort.
# Ordered by native chapter start.
MAPPING: dict[str, tuple[str, str, str, str | None]] = {
    "8bca9356": ("t-spawn",  "vents",    "side_a", None),      #  10 Connector
    "33bbc4d1": ("highway",  "mid",      "side_a", None),      #  17 Criss Cross (Garage throw of the criss-cross pair)
    "8405d54f": ("a-main",   "highway",  "side_a", None),      #  46 Highway
    "6ba60fd2": ("a-main",   "a-site",   "side_a", None),      #  63 A Cross
    "96144c18": ("a-main",   "a-site",   "side_a", None),      #  75 A Cross Waterfall
    "7ba223c8": ("highway",  "a-site",   "side_a", None),      #  97 A Cross Waterfall Smoke
    "2536d287": ("a-main",   "a-site",   "side_a", None),      # 110 Fast A Cross  (WEAK — no release/bloom filmed)
    "3c40df31": ("a-main",   "a-site",   "side_a", None),      # 121 A Backsite
    "b1e4fddb": ("b-main",   "a-site",   "side_a", None),      # 134 Tree  (stand radar=B Main; target off-screen)
    "0a747b59": ("sun-room", "a-site",   "side_a", None),      # 144 Tree From Sunroom (jumpthrow)
    "85b7fdcb": ("sun-room", "b-site",   "side_a", "molotov"), # 156 B Utility Combo -> MOLOTOV (re-type)
    "dbcc5cc3": ("b-main",   "b-site",   "side_a", None),      # 178 Heaven
    "db24c221": ("sun-room", "b-site",   "side_a", "molotov"), # 191 Heaven From Sunroom -> MOLOTOV (mis-typed smoke)
    "ce045a60": ("b-main",   "b-site",   "side_a", None),      # 212 B Lurk (smoke; chapter also has a separate molotov)
    "76a20ed1": ("mid",      "a-main",   "side_a", None),      # 256 Garage (LOW — name/zone conflict, landing off-cam)
    "69029776": ("highway",  "b-main",   "side_a", None),      # 268 Fast Garage Smoke
    "af9a2d18": ("highway",  "a-main",   "side_a", None),      # 292 A Main
    "0504ad48": ("b-site",   "b-main",   "side_b", None),      # 316 B Main (CT anti-exec)
    "a7bf5d6c": ("b-site",   "b-main",   "side_b", None),      # 327 B Retake Smoke (CT retake)
}


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="resolve + validate everything, write nothing")
    args = ap.parse_args()

    async with AsyncSessionLocal() as db:
        cache = (await db.execute(select(Map).where(Map.slug == "cache"))).scalar_one_or_none()
        if cache is None:
            raise SystemExit("cache map not found — load fixtures first")
        zones = {
            z.slug: z.id
            for z in (await db.execute(
                select(MapZone).where(MapZone.map_id == cache.id)
            )).scalars().all()
        }
        needed = {s for v in MAPPING.values() for s in v[:2]}
        missing_slugs = needed - set(zones)
        if missing_slugs:
            raise SystemExit(f"Cache zones missing in DB: {sorted(missing_slugs)} "
                             f"(have: {sorted(zones)})")

        # utility slugs for CS2 (cache.game_id) — used only for the 2 molotov re-types.
        util_ids = {
            u.slug: u.id
            for u in (await db.execute(
                select(UtilityType).where(UtilityType.game_id == cache.game_id)
            )).scalars().all()
        }
        needed_utils = {v[3] for v in MAPPING.values() if v[3]}
        missing_utils = needed_utils - set(util_ids)
        if missing_utils:
            raise SystemExit(f"CS2 utility types missing in DB: {sorted(missing_utils)} "
                             f"(have: {sorted(util_ids)})")

        print(f"{'id8':8} {'title':30} {'stand':9}->{'target':8} {'side':7} {'util':8} status")
        print("-" * 100)
        ok, errs = 0, []
        for id8, (stand_slug, target_slug, side, util_override) in MAPPING.items():
            lid = (await db.execute(text(
                "SELECT id FROM lineup WHERE substr(id::text,1,8)=:p"
            ), {"p": id8})).scalar_one_or_none()
            if lid is None:
                errs.append(f"{id8}: lineup not found")
                continue
            lineup = (await db.execute(select(Lineup).where(Lineup.id == lid))).scalar_one()

            game_id = lineup.suggested_game_id or lineup.game_id
            map_id = lineup.suggested_map_id or lineup.map_id
            # utility: the MAPPING override RE-TYPES the row (smoke->molotov) when set;
            # otherwise keep the row's stored/suggested utility.
            utility_type_id = (
                util_ids[util_override] if util_override
                else (lineup.suggested_utility_type_id or lineup.utility_type_id)
            )
            miss = [n for n, v in [("game_id", game_id), ("map_id", map_id),
                                   ("utility_type_id", utility_type_id)] if v is None]

            util_label = util_override if util_override else "(kept)"
            print(f"{id8:8} {lineup.title[:30]:30} {stand_slug:9}->{target_slug:8} "
                  f"{side:7} {util_label:8} {lineup.status}"
                  + (f"  !! MISSING {miss}" if miss else ""))
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
        print(f"{'DRY-RUN — no writes' if args.dry_run else f'ACCEPTED {ok}/19'}; "
              f"errors={len(errs)}")
        for e in errs:
            print(f"  ERR {e}")


asyncio.run(main())
