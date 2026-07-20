"""Create the 15 pending lineups for the Anubis guide video (et6AZ5a5k3I,
"Anubis Smokes ... 2026", by Tigerr) as a DIRECT DB write that BYPASSES the
classifier-coupled ingestion orchestrator.

Why bypass the orchestrator: ``ingestion_orchestrator`` is wired to yt-dlp +
the Claude classifier/localizer pipeline. This video is an *area-grouped guide*
(one chapter per map area, several throws each), so its chapters do not map
1:1 to lineups the way the pipeline assumes, and we have already ENUMERATED the
15 individual lineups by hand (below). This script realizes exactly those 15
rows in ``pending_review`` and nothing else.

What this script does NOT do (deliberately, per the localization workflow in
auto-memory ``feedback_mga_localize_by_frame_study``):
  - No screenshots, no clips, no wide sources, no MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side / accepted FKs — those are ACCEPTANCE-time fields and are
    forbidden as NULL only on ``accepted`` rows (see ``ck_lineup_accepted_classified``,
    which is gated ``status != 'accepted' OR (...)`` — pending rows are exempt).
Clips/localization come LATER via a separate frame-study pass +
``scripts/recut_lineup_clips.py``. This script only creates the base rows so
they appear in the review queue.

It DOES set, per row (safe on a pending row):
  - game_id   = cs2          (resolved by slug)
  - map_id    = anubis        (resolved by slug, scoped to cs2)
  - utility_type_id           (resolved by slug per the list: smoke/flash/molotov)
  - title / chapter_title (== the verbatim list name)
  - chapter_start_seconds
  - youtube_video_id          = et6AZ5a5k3I
  - attribution_author        = Tigerr
  - attribution_url           = https://www.youtube.com/watch?v=et6AZ5a5k3I
  - source_id                 = a dedicated source for this video (see below)
  - status                    = pending_review

Source handling: the existing source 1006e6cd is the UNRELATED 588UtJa98F0
montage playlist — we do NOT attach to it. Instead this script idempotently
ensures a dedicated source row for THIS video (kind=youtube_playlist — the
closest of the three allowed kinds, and the kind whose ``config_json.url`` the
fetcher's ``_source_url`` reads; the fetcher already passes ``watch?v=`` URLs
through untouched). Its ``config_json`` carries ``map_hint=anubis`` +
``game_hint=cs2`` so the source self-documents that every lineup from it is
cs2/Anubis (the same single-map hard-lock the classifier scoping uses). The
source is matched/created by its ``url`` so re-runs reuse it.

Idempotent: a lineup is created only if no row already exists with the same
``youtube_video_id`` + ``chapter_start_seconds``; otherwise it is skipped.
Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend (mirrors recut_lineup_clips.py):
  .venv/Scripts/python.exe scripts/create_anubis_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_anubis_lineups.py
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

# --- Constants for this specific video -------------------------------------
YOUTUBE_VIDEO_ID = "et6AZ5a5k3I"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "Tigerr"
GAME_SLUG = "cs2"
MAP_SLUG = "anubis"

# Verbatim enumerated lineups: (chapter_start_seconds, name, utility_slug).
# ``name`` is used for BOTH title and chapter_title (the list names ARE the
# chapter titles). utility_slug is one of the cs2 utility_type slugs
# (smoke / flash / molotov / grenade) — resolved to an id below.
LINEUPS: list[tuple[int, str, str]] = [
    (22, "DEEP MID SMOKE", "smoke"),
    (36, "MID - E BOX", "smoke"),
    (88, "MID - TEMPLE", "smoke"),
    (112, "MID - CAMERA", "smoke"),
    (134, "CT SIDE - T STAIRS", "smoke"),
    (188, "CT SIDE - DEEP MID CROSS", "smoke"),
    (212, "A SITE - HEAVEN", "smoke"),
    (232, "A SITE - CAMERA", "smoke"),
    (268, "A SITE - PLAT", "smoke"),
    (300, "A SITE FLASH", "flash"),
    (332, "B SITE - RIGHT SIDE SITE", "smoke"),
    (362, "B SITE - LEFT SIDE SITE", "smoke"),
    (378, "B SITE - PILLAR", "molotov"),
    (394, "B SITE - E BOX", "smoke"),
    (430, "LEFT SIDE SITE FROM SPAWN", "smoke"),
]


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="print exactly what WOULD be created (resolved ids + fields) and "
        "write nothing",
    )
    return p.parse_args()


async def _resolve_ids(db) -> tuple[str, str, dict[str, str]]:
    """Resolve cs2 game_id, anubis map_id, and the utility slug->id map.

    Aborts (SystemExit) if any required slug is unresolved so a typo can never
    silently create a row with a NULL FK.
    """
    game_id = (
        await db.execute(text("SELECT id FROM game WHERE slug=:s"), {"s": GAME_SLUG})
    ).scalar_one_or_none()
    if game_id is None:
        raise SystemExit(f"ABORT — game slug {GAME_SLUG!r} not found")

    map_id = (
        await db.execute(
            text("SELECT id FROM map WHERE slug=:s AND game_id=:g"),
            {"s": MAP_SLUG, "g": game_id},
        )
    ).scalar_one_or_none()
    if map_id is None:
        raise SystemExit(
            f"ABORT — map slug {MAP_SLUG!r} not found for game {GAME_SLUG!r}"
        )

    util_rows = (
        await db.execute(
            text("SELECT slug, id FROM utility_type WHERE game_id=:g"),
            {"g": game_id},
        )
    ).all()
    util_id = {slug: uid for slug, uid in util_rows}

    needed = {u for _, _, u in LINEUPS}
    missing = sorted(needed - set(util_id))
    if missing:
        raise SystemExit(
            f"ABORT — utility slug(s) {missing} not found for {GAME_SLUG!r}. "
            f"Available: {sorted(util_id)}"
        )
    return game_id, map_id, util_id


async def _ensure_source(db, *, dry_run: bool) -> str | None:
    """Idempotently find-or-create the dedicated source for this video.

    Matched by ``config_json->>'url' == VIDEO_URL`` so re-runs reuse the same
    source. In --dry-run, if the source does not exist yet, returns None and
    the caller prints the would-create plan (we never write in dry-run).
    """
    existing = (
        await db.execute(
            text("SELECT id FROM source WHERE config_json->>'url' = :u"),
            {"u": VIDEO_URL},
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    if dry_run:
        return None

    source = Source(
        kind="youtube_playlist",
        config_json={
            "url": VIDEO_URL,
            "map_hint": MAP_SLUG,
            "game_hint": GAME_SLUG,
        },
    )
    db.add(source)
    await db.flush()
    return source.id


async def _existing_chapter_starts(db) -> set[int]:
    """chapter_start_seconds already present for this video (idempotency key)."""
    rows = (
        await db.execute(
            select(Lineup.chapter_start_seconds).where(
                Lineup.youtube_video_id == YOUTUBE_VIDEO_ID
            )
        )
    ).all()
    return {cs for (cs,) in rows if cs is not None}


async def main() -> None:
    args = _parse_args()

    async with AsyncSessionLocal() as db:
        game_id, map_id, util_id = await _resolve_ids(db)
        source_id = await _ensure_source(db, dry_run=args.dry_run)
        existing_starts = await _existing_chapter_starts(db)

        print("== create_anubis_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  game       = {GAME_SLUG}  id={game_id}")
        print(f"  map        = {MAP_SLUG}  id={map_id}")
        print(f"  utility ids= {util_id}")
        if source_id is not None:
            print(f"  source_id  = {source_id}")
        else:
            print(
                "  source_id  = (would CREATE youtube_playlist source "
                f"url={VIDEO_URL} map_hint={MAP_SLUG} game_hint={GAME_SLUG})"
            )
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
                "game_id": game_id,
                "map_id": map_id,
                "utility_type_id": util_id[util_slug],
                "title": name,
                "chapter_title": name,
                "chapter_start_seconds": cs,
                "youtube_video_id": YOUTUBE_VIDEO_ID,
                "attribution_url": VIDEO_URL,
                "attribution_author": AUTHOR,
                "source_id": source_id,
                # ACCEPTANCE-time fields stay NULL on a pending row (allowed —
                # ck_lineup_accepted_classified gates on status='accepted').
                "target_zone_id": None,
                "stand_zone_id": None,
                "side": None,
                "status": "pending_review",
            }

            if args.dry_run:
                print(
                    f"    WOULD-CREATE cs={cs:<4} util={util_slug:<8} {name!r}"
                )
                continue

            lineup = Lineup(**data)
            db.add(lineup)
            await db.flush()  # populate lineup.id before commit
            created_ids.append(str(lineup.id))
            print(
                f"    CREATE cs={cs:<4} util={util_slug:<8} "
                f"id8={str(lineup.id)[:8]} {name!r}"
            )

        if args.dry_run:
            print(
                f"\n[DRY-RUN] would create {len(LINEUPS) - skipped}, "
                f"skip {skipped}. No writes performed."
            )
            return

        await db.commit()
        print(
            f"\nDONE — created {len(created_ids)}, skipped {skipped}. "
            f"new id8s: {[i[:8] for i in created_ids]}"
        )


asyncio.run(main())
