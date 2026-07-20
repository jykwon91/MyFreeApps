"""Auto-accept the 39 Sova/Ascent (MMni5F7Pfl0, Tseeky) lineups with derived
zones + side (2026-06-16).

Mirrors ``accept_cache_lineups.py`` — resolves each lineup's required fields
(suggested_* or existing value) then calls the repo ``accept_lineup`` directly
(skips the service wrapper only to avoid its MinIO-presign read-build, a
presentation concern). DB write path identical.

KEYED BY ``chapter_start_seconds`` (not id8): the Sova create + accept were both
authored before either ran, so id8s weren't known. chapter_start is the stable
per-lineup identity (it is the clip-storage key and never changes), so accept
looks each lineup up by (youtube_video_id, chapter_start_seconds). This is a
cleaner one-phase design than the Cache id8-keyed version.

Zone vocabulary (Ascent ``map_zone`` slugs, from valorant_maps.json — 8 zones):
  a-site b-site a-main b-main mid market t-spawn ct-spawn
side: side_a = Attacker, side_b = Defender (valorant game side labels).

Zones are COARSE best-fit approximations of each lineup's frame-study
STAND->TARGET callout (reversible post-accept on the glance board — the 8-zone
fixture is rougher than Sova's fine callouts like A Wine / A Lobby / Mid Link /
Top Mid / Heaven, which all coarsen onto a-site / a-main / mid). LOW-confidence
coarsenings are flagged inline; operator refines on the board.

Run via the MAIN checkout venv, cwd = backend (PG:5433 UP; create + recut first):
  python scripts/accept_sova_lineups.py --dry-run
  python scripts/accept_sova_lineups.py
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

YOUTUBE_VIDEO_ID = "MMni5F7Pfl0"
MAP_SLUG = "ascent"

# chapter_start -> (stand_zone_slug, target_zone_slug, side). side_a=Attacker,
# side_b=Defender. Coarsened from sova_spans.md STAND_LOC/TARGET. FLAG = a
# best-guess coarsening worth an operator eyeball on the board.
MAPPING: dict[int, tuple[str, str, str]] = {
    6:   ("a-main",   "a-site",   "side_b"),  #  1 DEF A Main
    22:  ("a-main",   "a-site",   "side_b"),  #  2 DEF A Main 2 Ult Combo   FLAG ult-as-recon; A Garden/Wine->a-main
    47:  ("a-main",   "a-main",   "side_b"),  #  3 DEF A Main 3 Fast
    67:  ("mid",      "a-site",   "side_b"),  #  4 DEF A Lobby/Top Mid God   stand A Lobby/Top Mid -> mid (operator refine 2026-06-30; was a-main)
    86:  ("ct-spawn", "a-site",   "side_b"),  #  5 DEF A Retake God Arrow    FLAG retake origin->ct-spawn
    102: ("a-site",   "a-site",   "side_b"),  #  6 DEF A Retake 2 Simple     FLAG stand A Rafters (in A)
    120: ("a-main",   "a-site",   "side_b"),  #  7 DEF A Support
    145: ("a-site",   "a-main",   "side_b"),  #  8 DEF A Support 2           FLAG reveals A Main from inside A
    166: ("mid",      "b-main",   "side_b"),  #  9 DEF B Main/Lobby Fast     FLAG stand dragon-mural (B/Mid)->mid
    184: ("market",   "b-site",   "side_b"),  # 10 DEF B Site Market Wallbang
    205: ("b-main",   "b-site",   "side_b"),  # 11 DEF B Lobby God Arrow
    226: ("b-main",   "b-site",   "side_b"),  # 12 DEF B Lobby 2 Simple
    246: ("ct-spawn", "b-site",   "side_b"),  # 13 DEF B Retake
    269: ("ct-spawn", "b-site",   "side_b"),  # 14 DEF B Retake 2 (If smoked)
    287: ("market",   "mid",      "side_b"),  # 15 DEF Middle                FLAG def-side Market/dragon-mural->market
    309: ("mid",      "mid",      "side_b"),  # 16 DEF Middle 2
    328: ("a-main",   "a-site",   "side_a"),  # 17 ATT A Main
    345: ("a-main",   "a-site",   "side_a"),  # 18 ATT A Wine                (A Wine/Garden -> a-site area)
    362: ("a-main",   "a-site",   "side_a"),  # 19 ATT A Site Close
    379: ("a-main",   "a-site",   "side_a"),  # 20 ATT A Site 2 God Arrow
    399: ("a-main",   "a-site",   "side_a"),  # 21 ATT A Site 3 Hidden Arrow
    418: ("a-main",   "a-site",   "side_a"),  # 22 ATT A Site 4 Simple
    436: ("mid",      "a-site",   "side_a"),  # 23 ATT A Site 5 Middle       (stand Mid Catwalk->mid)
    455: ("a-site",   "a-site",   "side_a"),  # 24 ATT A Site 6 Post-Plant Pop Recon
    473: ("a-main",   "a-site",   "side_a"),  # 25 ATT A Tree
    495: ("a-site",   "a-site",   "side_a"),  # 26 ATT A Heaven Wallbang var2 (a-main->a-site; shipped 2026-06-30 via pack re-export + import-lineups)
    516: ("b-main",   "b-site",   "side_a"),  # 27 ATT B Front Site
    537: ("b-main",   "b-site",   "side_a"),  # 28 ATT B Front Site 2
    556: ("b-main",   "b-site",   "side_a"),  # 29 ATT B Front Site 3 Close
    574: ("b-main",   "b-site",   "side_a"),  # 30 ATT B Site
    592: ("b-main",   "b-site",   "side_a"),  # 31 ATT B Site 2 Simple
    611: ("b-main",   "market",   "side_a"),  # 32 ATT B Market
    632: ("mid",      "mid",      "side_a"),  # 33 ATT Mid God Arrow (Mid Link)
    654: ("mid",      "mid",      "side_a"),  # 34 ATT Mid God Arrow 2 (Top Mid)
    672: ("a-main",   "a-site",   "side_a"),  # 35 SHOCK A Site Cypher Traps
    688: ("a-main",   "a-site",   "side_a"),  # 36 SHOCK A Default
    716: ("a-main",   "a-site",   "side_a"),  # 37 SHOCK A Dice
    732: ("b-main",   "b-site",   "side_a"),  # 38 SHOCK B Site Cypher Traps
    750: ("b-main",   "b-site",   "side_a"),  # 39 SHOCK B Default
}


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="resolve + validate everything, write nothing")
    args = ap.parse_args()

    async with AsyncSessionLocal() as db:
        amap = (await db.execute(select(Map).where(Map.slug == MAP_SLUG))).scalar_one_or_none()
        if amap is None:
            raise SystemExit(f"{MAP_SLUG} map not found — load fixtures first")
        zones = {
            z.slug: z.id
            for z in (await db.execute(
                select(MapZone).where(MapZone.map_id == amap.id)
            )).scalars().all()
        }
        needed = {s for v in MAPPING.values() for s in v[:2]}
        missing_slugs = needed - set(zones)
        if missing_slugs:
            raise SystemExit(f"Ascent zones missing in DB: {sorted(missing_slugs)} "
                             f"(have: {sorted(zones)})")

        print(f"{'cs':>4} {'title':40} {'stand':9}->{'target':8} {'side':7} status")
        print("-" * 96)
        ok, errs = 0, []
        for cs, (stand_slug, target_slug, side) in MAPPING.items():
            lid = (await db.execute(text(
                "SELECT id FROM lineup WHERE youtube_video_id=:v AND chapter_start_seconds=:c"
            ), {"v": YOUTUBE_VIDEO_ID, "c": cs})).scalar_one_or_none()
            if lid is None:
                errs.append(f"cs={cs}: lineup not found (run create_sova_lineups.py first)")
                continue
            lineup = (await db.execute(select(Lineup).where(Lineup.id == lid))).scalar_one()

            game_id = lineup.suggested_game_id or lineup.game_id
            map_id = lineup.suggested_map_id or lineup.map_id
            utility_type_id = lineup.suggested_utility_type_id or lineup.utility_type_id
            miss = [n for n, v in [("game_id", game_id), ("map_id", map_id),
                                   ("utility_type_id", utility_type_id)] if v is None]

            print(f"{cs:>4} {lineup.title[:40]:40} {stand_slug:9}->{target_slug:8} "
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

        print("-" * 96)
        print(f"{'DRY-RUN — no writes' if args.dry_run else f'ACCEPTED {ok}/{len(MAPPING)}'}; "
              f"errors={len(errs)}")
        for e in errs:
            print(f"  ERR {e}")


asyncio.run(main())
