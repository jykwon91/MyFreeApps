"""Create SIBLING lineups for the SMOKES-guide video (6DduFLHu7zM) combo chapters
whose non-primary utility deserves its own lineup — the "add all util" pass
(operator 2026-07-16).

Only ONE extra is filmable in this smokes video:
  * B Lurk Molotov [chapter 212,256]: the B Lurk chapter throws a smoke (primary,
    ce045a60) THEN a separate molotov. Localized (subagent, 2026-07-16):
    STAND 216.5 217.5 | AIM 217.9 218.4 | THROW 218.5 218.65 | LANDING 221.0 222.5,
    standing, b-main -> b-site, side_a, on-screen orange fire confirmed.

NOT created (documented, deliberately skipped):
  * B Flash [chapter 156,178]: the B Utility Combo chapter's flashbang release +
    white pop are NOT filmed anywhere in the window (dense study confirmed — the
    segment starts with the flash already thrown, no white detonation on screen).
    Creating it would reproduce the "clip shows the wrong moment" defect we just
    fixed. Flash coverage instead comes from the NADES guide (A Main / B Main /
    Mid flashes). If a source that films this flash surfaces, add it then.

Sibling keying: chapter_start_seconds is INTEGER and the MinIO clip key is
`pending/{video}/{cs}-{slot}`, so the sibling must use a DISTINCT integer cs from
the primary. cs = floor(STAND.start) = 216 (primary B Lurk smoke is at cs=212).
recut MUST pass --chapter-end 256 (native chapter end) so the wide source is
bounded correctly (the primary at 212 is already cut and is not re-touched).

Run (MAIN checkout venv, cwd = backend):
  .venv/Scripts/python.exe scripts/create_cache_combo_extras.py --dry-run
  .venv/Scripts/python.exe scripts/create_cache_combo_extras.py
Then:
  .venv/Scripts/python.exe scripts/recut_lineup_clips.py <id8> \
      --stand 216.5 217.5 --aim 217.9 218.4 --throw 218.5 218.65 \
      --landing 221.0 222.5 --chapter-end 256
  .venv/Scripts/python.exe scripts/create_cache_combo_extras.py --accept
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

YOUTUBE_VIDEO_ID = "6DduFLHu7zM"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "NartOutHere"
GAME_SLUG = "cs2"
MAP_SLUG = "cache"

# cs, chapter_title(native), title(display), utility, technique, target, stand, side
EXTRAS = [
    (216, "B Lurk", "B Lurk Molotov", "molotov", "standing", "b-site", "b-main", "side_a"),
]


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--accept", action="store_true", help="set zones/side on existing rows")
    args = ap.parse_args()

    async with AsyncSessionLocal() as db:
        game_id = (await db.execute(text("SELECT id FROM game WHERE slug=:s"),
                                    {"s": GAME_SLUG})).scalar_one()
        cache = (await db.execute(select(Map).where(Map.slug == MAP_SLUG, Map.game_id == game_id))).scalar_one()
        zones = {z.slug: z.id for z in (await db.execute(
            select(MapZone).where(MapZone.map_id == cache.id))).scalars().all()}
        utils = {u.slug: u.id for u in (await db.execute(
            select(UtilityType).where(UtilityType.game_id == game_id))).scalars().all()}
        source_id = (await db.execute(
            text("SELECT id FROM source WHERE config_json->>'url' = :u"), {"u": VIDEO_URL})).scalar_one_or_none()

        for cs, chap, title, util, tech, target, stand, side in EXTRAS:
            existing = (await db.execute(text(
                "SELECT id FROM lineup WHERE youtube_video_id=:v AND chapter_start_seconds=:c"),
                {"v": YOUTUBE_VIDEO_ID, "c": cs})).scalar_one_or_none()

            if args.accept:
                if existing is None:
                    print(f"  ACCEPT SKIP cs={cs} {title!r} — not created yet")
                    continue
                lineup = (await db.execute(select(Lineup).where(Lineup.id == existing))).scalar_one()
                await accept_lineup(db, lineup, {
                    "game_id": lineup.game_id, "map_id": lineup.map_id,
                    "utility_type_id": utils[util],
                    "target_zone_id": zones[target], "stand_zone_id": zones[stand], "side": side,
                })
                print(f"  ACCEPT cs={cs} id8={str(existing)[:8]} {util} {stand}->{target} {side} {title!r}")
                continue

            if existing is not None:
                print(f"  SKIP cs={cs} {title!r} (exists id8={str(existing)[:8]})")
                continue
            if args.dry_run:
                print(f"  WOULD-CREATE cs={cs} util={util} {title!r} (chapter {chap!r})")
                continue
            lineup = Lineup(
                game_id=game_id, map_id=cache.id, utility_type_id=utils[util],
                title=title, chapter_title=chap, chapter_start_seconds=cs,
                youtube_video_id=YOUTUBE_VIDEO_ID, attribution_url=VIDEO_URL,
                attribution_author=AUTHOR, source_id=source_id, technique=tech,
                target_zone_id=None, stand_zone_id=None, side=None, status="pending_review",
            )
            db.add(lineup)
            await db.flush()
            print(f"  CREATE cs={cs} util={util} id8={str(lineup.id)[:8]} {title!r}")

        if not args.dry_run:
            await db.commit()
        print("DONE" + (" (dry-run, no writes)" if args.dry_run else ""))


asyncio.run(main())
