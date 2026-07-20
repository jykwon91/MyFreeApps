"""Create the 37 pending lineups for NartOutHere's Dust 2 nades guide video
(voM-FpCNqtU, "The ONLY CS2 DUST 2 NADES GUIDE You'll EVER NEED", uploaded
2024-04-29) as a DIRECT DB write that BYPASSES the classifier-coupled ingestion
orchestrator. Same shape as ``create_cs2_inferno_lineups.py`` /
``create_cache_lineups.py`` / ``create_anubis_lineups.py``.

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is chaptered per named position (one
native chapter per nade or grouped-nade position — the demo-style format like
the accepted Inferno video), so we enumerate the 37 lineup chapters by hand here.
``dump_chapters`` gave 38 native chapters = 1 Intro (chapter 0, 0-44s) + 37 lineups.

VETTING (2026-07-08): NartOutHere is the gold-standard channel whose Inferno
smoke guide (2pSqBc6M10s) was frame-study-ACCEPTED. THIS Dust 2 guide is the
same demo-style FIT — first-person practice-server, steady single-take
stand->aim->throw->landing per chapter. Confirmed by coarse contact-sheets of
3 sample chapters spanning ALL utility types: "Xbox Smoke" (smoke bloom
landing), "Long A Flash (T)" (white flash-pop landing), "Goose Molotov" (green
bottle -> crosshair on the A/HOTEL AURORE sign -> molly flames landing). Events
are pinned by MODE-INVARIANT signals (player at spot / nade leaving hand / smoke
bloom / flash pop / molly flames); the practice trajectory arc is orient-only.
1920x1080@60fps, 924.074s.

Unlike Inferno (all smokes), THIS video is a full NADES guide — a MIX of
utility: 24 smoke, 8 molotov, 5 flash (no HE/grenade chapters). Utility slug per
chapter comes from the native chapter title (CS2 DB slugs: smoke, molotov,
flash, grenade). A few GROUPED/COMBO chapters mix utilities ("A Execute",
"CT Mid Nades", "CT Long A Nades"); each is created as ONE primary lineup (the
title's leading/dominant utility) and the rest are described in NOTES at
localize time.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via frame study + ``scripts/recut_lineup_clips.py``;
zones+side via a ``scripts/accept_cs2_dust2_lineups.py`` (added at accept time).

Source: idempotently ensures a dedicated ``youtube_playlist`` source matched by
``config_json->>'url'``; its ``config_json`` carries ``map_hint=dust2`` +
``game_hint=cs2`` (the single-map hard-lock the classifier scoping uses, #782).

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend:
  .venv/Scripts/python.exe scripts/create_cs2_dust2_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_cs2_dust2_lineups.py
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

YOUTUBE_VIDEO_ID = "voM-FpCNqtU"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "NartOutHere"
GAME_SLUG = "cs2"
MAP_SLUG = "dust2"

# (chapter_start_seconds, name, utility_slug) — verbatim native chapter titles.
# chapter_start_seconds IS each lineup's clip-storage identity AND drives
# recut_lineup_clips.py's contiguous chapter_end (= next row's start). The 37
# starts are contiguous; the LAST row (896) has no next row, so pass
# `recut --chapter-end 925` (ceil of the 924.074s duration).
# MIX of utility (24 smoke / 8 molotov / 5 flash). Utility per native title.
LINEUPS: list[tuple[int, str, str]] = [
    (44,  "Instant Xbox Smoke",                     "smoke"),    # ce=50
    (50,  "Xbox Smoke",                             "smoke"),    # ce=59
    (59,  "Hinge Smoke",                            "smoke"),    # ce=74
    (74,  "Mid Door Molotov",                       "molotov"),  # ce=96
    (96,  "Instant Long A Corner Smoke",            "smoke"),    # ce=110
    (110, "Long A Corner Smoke",                    "smoke"),    # ce=146
    (146, "Long A House Smoke",                     "smoke"),    # ce=164
    (164, "Long A Flash (T)",                       "flash"),    # ce=192  (grouped, 28s)
    (192, "Long A Door Flash",                      "flash"),    # ce=201
    (201, "Car Molotov",                            "molotov"),  # ce=213
    (213, "A Cross Smokes",                         "smoke"),    # ce=303  (grouped, 90s)
    (303, "Short A Flash",                          "flash"),    # ce=311
    (311, "Setup Smoke",                            "smoke"),    # ce=320
    (320, "Goose Molotov - JAME",                   "molotov"),  # ce=342
    (342, "Ramp & Site Molotov - m0NESY",           "molotov"),  # ce=356  (combo)
    (356, "Avangar Smoke",                          "smoke"),    # ce=368
    (368, "A Execute",                              "smoke"),    # ce=400  (COMBO execute — smoke+molly+flash)
    (400, "A God Flash - m0NESY",                   "flash"),    # ce=448  (grouped, 48s)
    (448, "CT Smoke From Mid",                      "smoke"),    # ce=467
    (467, "CT Molotov",                             "molotov"),  # ce=477
    (477, "A Site Smoke",                           "smoke"),    # ce=491
    (491, "A Site Postplant Molotov",               "molotov"),  # ce=503
    (503, "B window and B Door Smoke",              "smoke"),    # ce=527  (combo)
    (527, "B Door Smoke From Tunnel",               "smoke"),    # ce=539
    (539, "B Flashes",                              "flash"),    # ce=544  (grouped, 5s)
    (544, "B Lurk Smoke",                           "smoke"),    # ce=577
    (577, "Mid Door Molotov",                       "molotov"),  # ce=582
    (582, "Mid to B Smoke",                         "smoke"),    # ce=589
    (589, "NEW Mid to B Smoke",                     "smoke"),    # ce=613
    (613, "META Mid to B Smoke",                    "smoke"),    # ce=633
    (633, "Mid to B Smoke From Outside Long",       "smoke"),    # ce=649
    (649, "Left Mid Smoke",                         "smoke"),    # ce=661
    (661, "CT Mid Nades",                           "smoke"),    # ce=742  (GROUPED mixed, 81s)
    (742, "CT Long A Nades",                        "smoke"),    # ce=843  (GROUPED mixed, 101s)
    (843, "A Defensive Smokes",                     "smoke"),    # ce=888  (grouped, 45s)
    (888, "B Defensive Smoke",                      "smoke"),    # ce=896
    (896, "B Retake Molotovs",                      "molotov"),  # ce=925  (grouped; pass --chapter-end 925)
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

        print("== create_cs2_dust2_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=dust2)'}")
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
