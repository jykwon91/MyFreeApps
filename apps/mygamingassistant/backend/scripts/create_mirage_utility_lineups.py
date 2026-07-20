"""Create the 9 NON-SMOKE pending lineups for Tigerr's Mirage Utility Guide
video (SGeV9W39X68, "Mirage Utility You MUST KNOW ... | CS2 Mirage Utility
Guide", uploaded 2025-11-24) as a DIRECT DB write that bypasses the
classifier-coupled ingestion orchestrator. Same shape as
``create_anubis_lineups.py``.

Why only 9 (not all 19 chapters): this video is PER-LINEUP chaptered (one named
chapter per lineup — the gold-standard format). It has 3 flashes + 6 molotovs +
~10 smokes. The operator wants the NON-SMOKE utility (flash/molotov; HE handled
separately — this video has none); the smokes overlap the 11 already-accepted
Mirage smokes (from Q4Dwg9Z0wZ0), so they are SKIPPED here to avoid duplicates.

Per-lineup chapters mean each chapter's [start, end] is one lineup's window.
Because we skip the in-between smoke chapters, the create rows are NOT
contiguous, so ``recut_lineup_clips.py``'s next-chapter auto-bound would be
wrong — pass the real chapter end via ``--chapter-end`` at recut time (the ends
are in the comment beside each row below).

Acceptance: these are created in ``pending_review`` and (per operator 2026-05-31)
are NOT auto-accepted — the operator reviews/accepts flash/molly/HE in the queue.

Sets per row (safe on a pending row): game_id=cs2, map_id=mirage,
utility_type_id (flash/molotov), title/chapter_title, chapter_start_seconds,
youtube_video_id, attribution, source_id (dedicated source w/ map_hint=mirage).
Leaves NULL (acceptance-time): target_zone_id, stand_zone_id, side, and all
clip/localization fields. Idempotent by (youtube_video_id, chapter_start_seconds).

Run via the MAIN checkout venv, cwd = backend:
  .venv/Scripts/python.exe scripts/create_mirage_utility_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_mirage_utility_lineups.py
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

YOUTUBE_VIDEO_ID = "SGeV9W39X68"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "Tigerr"
GAME_SLUG = "cs2"
MAP_SLUG = "mirage"

# (chapter_start_seconds, name, utility_slug) — verbatim chapter titles.
# Trailing comment = the chapter's real END (pass as `recut --chapter-end`).
LINEUPS: list[tuple[int, str, str]] = [
    (75,  "A Site - Site Flash",        "flash"),    # ce=122
    (122, "A Site - Firebox Molotov",   "molotov"),  # ce=139
    (139, "CT Side - A Main Molotov",   "molotov"),  # ce=168
    (284, "Mid - Cross Flash",          "flash"),    # ce=319
    (343, "Top Mid - Window Molotov",   "molotov"),  # ce=372
    (452, "B Site - Balcony Molotov",   "molotov"),  # ce=479
    (479, "B Site - Bench Molotov",     "molotov"),  # ce=514
    (514, "B Site - Site Flash",        "flash"),    # ce=566
    (566, "CT Side - Aps Door Molotovs", "molotov"), # ce=583
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
        raise SystemExit(f"ABORT — map slug {MAP_SLUG!r} not found for {GAME_SLUG!r}")
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

        print("== create_mirage_utility_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE)'}")
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
