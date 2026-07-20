"""Create the 27 pending lineups for NartOutHere's Inferno smoke guide video
(2pSqBc6M10s, "ALL CS2 Inferno Smokes You NEED to Know", uploaded 2024-05-03) as
a DIRECT DB write that BYPASSES the classifier-coupled ingestion orchestrator.
Same shape as ``create_cache_lineups.py`` / ``create_anubis_lineups.py``.

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is chaptered per named position (one
native chapter per smoke or grouped-smoke position — the demo-style format like
the Cache video), so we enumerate the 27 lineup chapters by hand here.
``dump_chapters`` gave 28 native chapters = 1 Intro (chapter 0) + 27 lineups.

VETTING (2026-07-08): although NartOutHere is the SAME creator whose Anubis
(588UtJa98F0) + Mirage (xPCYPKFG44E) videos were frame-study-REJECTED as
montages, THIS video is demo-style FIT — first-person practice-server, steady
single-take stand->aim->throw->landing per chapter (confirmed by coarse
contact-sheets of "META Halfwall Smoke", "Coffin Smokes", "A Site Smoke"). The
CS2 practice trajectory arc is visible and helps orient, but events are pinned
by MODE-INVARIANT signals (player at spot / nade leaving hand / smoke bloom).
1920x1080@60fps, 772.494s.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via frame study + ``scripts/recut_lineup_clips.py``;
zones+side via a ``scripts/accept_cs2_inferno_lineups.py`` (added at accept time).

Source: idempotently ensures a dedicated ``youtube_playlist`` source matched by
``config_json->>'url'``; its ``config_json`` carries ``map_hint=inferno`` +
``game_hint=cs2`` (the single-map hard-lock the classifier scoping uses, #782).

All 27 rows are ``smoke`` (the whole video is smokes only). Several chapters are
GROUPED ("Smokes" plural / "1 Position" combos / "&" pairs) that demonstrate 2-3
throws; each such chapter is created here as ONE primary smoke lineup. If a
distinct second variation is worth its own row it gets added later at its own
(distinct) chapter_start.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend:
  .venv/Scripts/python.exe scripts/create_cs2_inferno_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_cs2_inferno_lineups.py
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

YOUTUBE_VIDEO_ID = "2pSqBc6M10s"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "NartOutHere"
GAME_SLUG = "cs2"
MAP_SLUG = "inferno"

# (chapter_start_seconds, name, utility_slug) — verbatim native chapter titles.
# chapter_start_seconds IS each lineup's clip-storage identity AND drives
# recut_lineup_clips.py's contiguous chapter_end (= next row's start). The 27
# starts are contiguous; the LAST row (746) has no next row, so pass
# `recut --chapter-end 773` (ceil of the 772.494s duration) for it.
# All 27 are `smoke` (title = "ALL CS2 Inferno Smokes").
LINEUPS: list[tuple[int, str, str]] = [
    (50,  "META Halfwall Smoke From T Spawn",   "smoke"),  # ce=70
    (70,  "Bottom Banana Smoke From T Spawn",   "smoke"),  # ce=88
    (88,  "Top Banana Corner Smoke",            "smoke"),  # ce=99
    (99,  "FAST CT Smoke",                      "smoke"),  # ce=106
    (106, "CT Smoke From T Stairs",             "smoke"),  # ce=119
    (119, "CT Boost Smokes",                    "smoke"),  # ce=163  (grouped)
    (163, "Deep CT Smoke",                      "smoke"),  # ce=177
    (177, "Coffin Smokes",                      "smoke"),  # ce=261  (grouped, 84s)
    (261, "CT & Coffin Smoke 1 Position",       "smoke"),  # ce=274  (combo)
    (274, "Front B Smoke",                      "smoke"),  # ce=292
    (292, "Mid Smoke",                          "smoke"),  # ce=303
    (303, "Top Mid Smokes",                     "smoke"),  # ce=382  (grouped, 79s)
    (382, "Moto Smokes",                        "smoke"),  # ce=444  (grouped, 62s)
    (444, "Arch Smokes",                        "smoke"),  # ce=472  (grouped)
    (472, "Library Smokes",                     "smoke"),  # ce=519  (grouped)
    (519, "Arch & Library Smokes 1 Position",   "smoke"),  # ce=551  (combo)
    (551, "B Wrap Smoke",                       "smoke"),  # ce=588
    (588, "A Site Smoke",                       "smoke"),  # ce=605
    (605, "A Wrap Smoke",                       "smoke"),  # ce=616
    (616, "Aps Lurk Smoke",                     "smoke"),  # ce=653
    (653, "Short Smoke & Moto Smoke",           "smoke"),  # ce=673  (combo)
    (673, "CT Side Smokes",                     "smoke"),  # ce=682  (grouped)
    (682, "Top Stairs / Bottom Banana Smokes",  "smoke"),  # ce=704  (combo)
    (704, "Mid Banana Smoke From CT Spawn",     "smoke"),  # ce=722
    (722, "Instant Mid Smoke - FaZe",           "smoke"),  # ce=737
    (737, "Deep Mid Smoke From CT Spawn",       "smoke"),  # ce=746
    (746, "Retake Smokes",                      "smoke"),  # ce=773  (pass --chapter-end 773)
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

        print("== create_cs2_inferno_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=inferno)'}")
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
