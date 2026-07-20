"""Create the 39 pending lineups for NartOutHere's Vertigo smokes guide video
(CR3cNNTPQs0, "Essential CS2 Vertigo Smokes You NEED To Know (2024)", uploaded
2024-08-07) as a DIRECT DB write that BYPASSES the classifier-coupled ingestion
orchestrator. Same shape as ``create_cs2_nuke_lineups.py`` /
``create_cs2_overpass_lineups.py`` / ``create_cs2_dust2_lineups.py`` /
``create_cs2_inferno_lineups.py`` / ``create_anubis_lineups.py``.

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is chaptered per named position (one
native chapter per single smoke — 40 chapters = 1 Intro (chapter 0, 0-39s) + 39
lineups), so we enumerate the 39 lineup chapters by hand here. ``dump_chapters``
gave 40 native chapters.

VETTING (2026-07-08): NartOutHere is the gold-standard channel whose Inferno
smoke guide (2pSqBc6M10s), Dust 2 nades guide (voM-FpCNqtU), Nuke nades guide
(6_WAimVYF0I) and Overpass nades guide (hGc4PNhGRQ0) were frame-study ACCEPTED.
THIS Vertigo guide is the DIRECT ANALOGUE of the accepted Inferno SMOKE guide —
a PRACTICE-SERVER, per-throw demo (one clean stand->aim->throw->landing per
chapter), and — like Inferno — an ALL-SMOKE guide (every one of the 39 chapters
is a named smoke). Chapters are 6-37s each (per-throw), NOT the weak grouped-GOTV
compilation shape the task warns against. Rejected alternatives (searched
2026-07-08): NartOutHere's 2023 "CS2 Vertigo Nades That YOU NEED TO KNOW!"
(edmB2IPDBWU) has only 8 COARSE grouped chapters (100-344s each, many throws per
chapter) = the weak grouped shape; "Essential Vertigo Nades CS2" (GGx7sk7AyQ4) is
a PRIVATE video; "EVERY Smoke You MUST KNOW on Vertigo" (MxLga5CnMFs) and "NEW
Vertigo Smokes" (a12Uev9J3j4) have coarser/older chapters. CR3cNNTPQs0's 39
per-throw named-smoke chapters are the best available Vertigo source. 1920x1080
@ 60fps (av1), 559.974s.

Because every chapter is a smoke, the LANDING signature is uniform — the smoke
plume BLOOMS into the round sphere at the destination. A few GROUPED/plural
chapters (#05 "A Execute", #20 "b smokes", #24 "b rush smokes", #37 "A Retake
Smokes") demonstrate 2-3 throws — each is created as ONE smoke row; localize the
PRIMARY (first/clearest) smoke bloom and describe the rest in NOTES. NO title
guesses (every title explicitly says "smoke") and NO molotov/flash/HE chapters,
so no re-classification risk — utility slug is `smoke` for all 39 rows.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via frame study + ``scripts/recut_lineup_clips.py``;
zones+side via a ``scripts/accept_cs2_vertigo_lineups.py`` (added at accept time).

Source: idempotently ensures a dedicated ``youtube_playlist`` source with the
fixed UUID ``223f5804-dece-49fe-89bb-5d5392b87793`` (matched by
``config_json->>'url'``); its ``config_json`` carries ``map_hint=vertigo`` +
``game_hint=cs2`` (the single-map hard-lock the classifier scoping uses, #782).
NO agent_hint (that is Valorant/Sova-only).

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend:
  .venv/Scripts/python.exe scripts/create_cs2_vertigo_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_cs2_vertigo_lineups.py
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

YOUTUBE_VIDEO_ID = "CR3cNNTPQs0"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "NartOutHere"
GAME_SLUG = "cs2"
MAP_SLUG = "vertigo"
SOURCE_UUID = "223f5804-dece-49fe-89bb-5d5392b87793"

# (chapter_start_seconds, name, utility_slug) — verbatim native chapter titles.
# chapter_start_seconds IS each lineup's clip-storage identity AND drives
# recut_lineup_clips.py's contiguous chapter_end (= next row's start). The 39
# starts are contiguous; the LAST row (547) has no next row, so pass
# `recut --chapter-end 560` (ceil of the 559.974s duration).
# ALL-SMOKE guide (39 smoke / 0 molotov / 0 flash / 0 grenade) — like Inferno.
LINEUPS: list[tuple[int, str, str]] = [
    (39,  "Vertigo T Ramp Smoke",                 "smoke"),  # ce=76
    (76,  "New Meta Vertigo Ramp Smoke",          "smoke"),  # ce=90
    (90,  "Vertigo Ivy smoke",                    "smoke"),  # ce=102
    (102, "Ivy Smoke From Stairs",                "smoke"),  # ce=113
    (113, "Vertigo A Execute",                    "smoke"),  # ce=133  GROUPED EXECUTE (20s)
    (133, "Vertigo Left Elevator Smoke",          "smoke"),  # ce=144
    (144, "CS2 Vertigo Elevator Smoke",           "smoke"),  # ce=154
    (154, "How to smoke elevator on vertigo",     "smoke"),  # ce=163
    (163, "cs2 vertigo connector smoke",          "smoke"),  # ce=171  short (8s)
    (171, "Connector vertigo smoke",              "smoke"),  # ce=183
    (183, "how to smoke connector on vertigo",    "smoke"),  # ce=196
    (196, "deep elevator smoke",                  "smoke"),  # ce=207
    (207, "Vertigo A Site Smoke",                 "smoke"),  # ce=219
    (219, "CS2 Vertigo A smoke",                  "smoke"),  # ce=233
    (233, "vertigo short smoke",                  "smoke"),  # ce=243
    (243, "Vertigo heaven smoke",                 "smoke"),  # ce=255
    (255, "vertigo b main smoke",                 "smoke"),  # ce=277
    (277, "cs2 vertigo b lurk smoke",             "smoke"),  # ce=283  short (6s)
    (283, "vertigo b pressure smoke",             "smoke"),  # ce=300
    (300, "cs2 vertigo b smokes",                 "smoke"),  # ce=310  GROUPED (plural, 10s)
    (310, "vertigo right gen smoke",              "smoke"),  # ce=333
    (333, "vertigo left gen smoke",               "smoke"),  # ce=343
    (343, "cs2 vertigo gen smoke",                "smoke"),  # ce=357
    (357, "vertigo b rush smokes",                "smoke"),  # ce=375  GROUPED (plural, 18s)
    (375, "Vertigo mid smoke",                    "smoke"),  # ce=387
    (387, "mid elevator smoke from platform",     "smoke"),  # ce=401
    (401, "vertigo ct smoke",                     "smoke"),  # ce=412  CT-side (defender)
    (412, "cs2 vertigo ramp smoke",               "smoke"),  # ce=420  short (8s)
    (420, "ramp waterfall smoke from sandbag",    "smoke"),  # ce=430
    (430, "mid ramp waterfall smoke from short",  "smoke"),  # ce=439
    (439, "vertigo yellow smoke",                 "smoke"),  # ce=451
    (451, "cs2 vertigo gap smoke",                "smoke"),  # ce=461
    (461, "how to smoke yellow on vertigo",       "smoke"),  # ce=475
    (475, "vertigo top yellow smoke",             "smoke"),  # ce=482  short (7s)
    (482, "vertigo B stair smoke",                "smoke"),  # ce=497
    (497, "b stair smoke on vertigo",             "smoke"),  # ce=508
    (508, "Vertigo A Retake Smokes",              "smoke"),  # ce=530  GROUPED (plural, 22s); CT retake
    (530, "Vertigo B Retake Smoke",               "smoke"),  # ce=547  CT retake (defender)
    (547, "Vertigo Defensive B Smoke",            "smoke"),  # ce=560 (LAST → --chapter-end 560; video 559.974s, ceil 560); CT defensive
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
        id=SOURCE_UUID,
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

        print("== create_cs2_vertigo_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else f'(would CREATE {SOURCE_UUID} map_hint=vertigo)'}")
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
