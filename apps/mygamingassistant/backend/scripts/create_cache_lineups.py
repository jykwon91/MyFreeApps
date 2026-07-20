"""Create the 19 pending lineups for NartOutHere's Cache guide video
(6DduFLHu7zM, "The ONLY Cache Smokes You Need in CS2", uploaded 2026-05-01) as a
DIRECT DB write that BYPASSES the classifier-coupled ingestion orchestrator.
Same shape as ``create_anubis_lineups.py`` / ``create_mirage_utility_lineups.py``.

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is PER-LINEUP chaptered (one named
chapter per lineup — the gold-standard format, like the Mirage Tigerr video), so
we enumerate the 19 lineup chapters by hand here. ``dump_chapters.py 6DduFLHu7zM``
gave 21 native chapters = 19 lineups + Intro/Outro.

VETTING (2026-06-01): although NartOutHere is the SAME creator whose Anubis
(588UtJa98F0) + Mirage (xPCYPKFG44E) videos were frame-study-REJECTED as
montages, THIS video is demo-style FIT — first-person practice-server, steady
single-take stand->aim->throw->landing per chapter (confirmed by coarse
contact-sheets of Criss Cross / Connector / B Utility Combo). 1920x1080@60fps.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via frame study + ``scripts/recut_lineup_clips.py``;
zones+side via ``scripts/accept_cache_lineups.py``.

Source: idempotently ensures a dedicated ``youtube_playlist`` source matched by
``config_json->>'url'``; its ``config_json`` carries ``map_hint=cache`` +
``game_hint=cs2`` (the single-map hard-lock the classifier scoping uses, #782).

All 19 rows are ``smoke``. The "B Utility Combo" (cs=156) chapter ALSO contains a
molotov — created here as the primary smoke only; if the molly is worth a
distinct lineup it gets added later at its own (distinct) chapter_start.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend:
  .venv/Scripts/python.exe scripts/create_cache_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_cache_lineups.py
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
from app.models.game.source import Source  # noqa: E402

YOUTUBE_VIDEO_ID = "6DduFLHu7zM"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "NartOutHere"
GAME_SLUG = "cs2"
MAP_SLUG = "cache"

# (chapter_start_seconds, name, utility_slug) — verbatim native chapter titles.
# chapter_start_seconds IS each lineup's clip-storage identity AND drives
# recut_lineup_clips.py's contiguous chapter_end (= next row's start). The 19
# starts are contiguous; the LAST row (327) has no next row, so pass
# `recut --chapter-end 354` (the Outro start) for it to bound its wide source.
LINEUPS: list[tuple[int, str, str]] = [
    (10,  "Connector",                "smoke"),  # ce=17
    (17,  "Criss Cross",              "smoke"),  # ce=46
    (46,  "Highway",                  "smoke"),  # ce=63
    (63,  "A Cross",                  "smoke"),  # ce=75
    (75,  "A Cross Waterfall",        "smoke"),  # ce=97
    (97,  "A Cross Waterfall Smoke",  "smoke"),  # ce=110  (pair w/ prev)
    (110, "Fast A Cross",             "smoke"),  # ce=121
    (121, "A Backsite",               "smoke"),  # ce=134
    (134, "Tree",                     "smoke"),  # ce=144
    (144, "Tree From Sunroom",        "smoke"),  # ce=156
    (156, "B Utility Combo",          "smoke"),  # ce=178  RE-TYPED->molotov + DISPLAY-RENAMED
    #                                            "B Molotov (from Sun Room)" at accept (2026-07-16).
    #                                            chapter_title stays native. Combo chapter also has a B Flash.
    (178, "Heaven",                   "smoke"),  # ce=191
    (191, "Heaven From Sunroom",      "smoke"),  # ce=212
    (212, "B Lurk",                   "smoke"),  # ce=256  (44s chapter)
    (256, "Garage",                   "smoke"),  # ce=268
    (268, "Fast Garage Smoke",        "smoke"),  # ce=292
    (292, "A Main",                   "smoke"),  # ce=316
    (316, "B Main",                   "smoke"),  # ce=327
    (327, "B Retake Smoke",           "smoke"),  # ce=354  (pass --chapter-end 354)
]


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true",
                   help="print the resolved plan and write nothing")
    return p.parse_args()


async def _resolve_ids(db) -> tuple[str, str, dict[str, str]]:
    game_id = (await db.execute(
        text("SELECT id FROM game WHERE slug=:s"), {"s": GAME_SLUG})).scalar_one_or_none()
    if game_id is None:
        raise SystemExit(f"ABORT — game slug {GAME_SLUG!r} not found")
    map_id = (await db.execute(
        text("SELECT id FROM map WHERE slug=:s AND game_id=:g"),
        {"s": MAP_SLUG, "g": game_id})).scalar_one_or_none()
    if map_id is None:
        raise SystemExit(f"ABORT — map slug {MAP_SLUG!r} not found for {GAME_SLUG!r} "
                         f"(run `python -m app.cli load-fixtures`)")
    util_rows = (await db.execute(
        text("SELECT slug, id FROM utility_type WHERE game_id=:g"), {"g": game_id})).all()
    util_id = {slug: uid for slug, uid in util_rows}
    needed = {u for _, _, u in LINEUPS}
    missing = sorted(needed - set(util_id))
    if missing:
        raise SystemExit(f"ABORT — utility slug(s) {missing} not found for {GAME_SLUG!r}. "
                         f"Available: {sorted(util_id)}")
    return game_id, map_id, util_id


async def _ensure_source(db, *, dry_run: bool) -> str | None:
    existing = (await db.execute(
        text("SELECT id FROM source WHERE config_json->>'url' = :u"),
        {"u": VIDEO_URL})).scalar_one_or_none()
    if existing is not None:
        return existing
    if dry_run:
        return None
    source = Source(
        kind="youtube_playlist",
        config_json={"url": VIDEO_URL, "map_hint": MAP_SLUG, "game_hint": GAME_SLUG},
    )
    db.add(source)
    await db.flush()
    return source.id


async def _existing_chapter_starts(db) -> set[int]:
    rows = (await db.execute(
        select(Lineup.chapter_start_seconds).where(
            Lineup.youtube_video_id == YOUTUBE_VIDEO_ID))).all()
    return {cs for (cs,) in rows if cs is not None}


async def main() -> None:
    args = _parse_args()
    async with AsyncSessionLocal() as db:
        game_id, map_id, util_id = await _resolve_ids(db)
        source_id = await _ensure_source(db, dry_run=args.dry_run)
        existing_starts = await _existing_chapter_starts(db)

        print("== create_cache_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=cache)'}")
        print(f"  already-present chapter_starts: {sorted(existing_starts)}")
        print(f"  {'[DRY-RUN] ' if args.dry_run else ''}plan ({len(LINEUPS)} rows):")

        created_ids: list[str] = []
        skipped = 0
        for cs, name, util_slug in LINEUPS:
            if cs in existing_starts:
                print(f"    SKIP  cs={cs:<4} {name!r} (already exists)")
                skipped += 1
                continue
            data = {
                "game_id": game_id, "map_id": map_id,
                "utility_type_id": util_id[util_slug],
                "title": name, "chapter_title": name,
                "chapter_start_seconds": cs,
                "youtube_video_id": YOUTUBE_VIDEO_ID,
                "attribution_url": VIDEO_URL, "attribution_author": AUTHOR,
                "source_id": source_id,
                "target_zone_id": None, "stand_zone_id": None, "side": None,
                "status": "pending_review",
            }
            if args.dry_run:
                print(f"    WOULD-CREATE cs={cs:<4} util={util_slug:<8} {name!r}")
                continue
            lineup = Lineup(**data)
            db.add(lineup)
            await db.flush()
            created_ids.append(str(lineup.id))
            print(f"    CREATE cs={cs:<4} util={util_slug:<8} id8={str(lineup.id)[:8]} {name!r}")

        if args.dry_run:
            print(f"\n[DRY-RUN] would create {len(LINEUPS) - skipped}, skip {skipped}. No writes.")
            return
        await db.commit()
        print(f"\nDONE — created {len(created_ids)}, skipped {skipped}. "
              f"new id8s: {[i[:8] for i in created_ids]}")


asyncio.run(main())
