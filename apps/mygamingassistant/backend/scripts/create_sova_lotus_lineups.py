"""Create the 23 pending Sova/Lotus lineups for Tseeky's guide video
(iGA1BeLmEqU, "Sova Lineups Lotus - Valorant Guide *NEW*", uploaded 2023-02-24)
as a DIRECT DB write that BYPASSES the classifier-coupled ingestion orchestrator.

Same shape as ``create_sova_haven_lineups.py`` (Haven) / ``create_sova_lineups.py``
(Ascent) / ``create_sova_breeze_lineups.py`` (Breeze). Fourth Valorant ingest
(after Ascent MMni5F7Pfl0, Breeze 9STlc0XPsrw, Haven czketOpD2p8).

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is PER-LINEUP chaptered (one named
chapter per lineup — the gold-standard format), so we enumerate the 23 lineup
chapters by hand here. ``dump_chapters.py iGA1BeLmEqU`` gave 24 native chapters
= 23 lineups + chapter#0 intro [0,7] (excluded). Chapters are CONTIGUOUS, so
``recut_lineup_clips.py`` auto-bounds each clip by the next row's start; the
LAST row (#23, cs=457) has no next row → pass ``recut --chapter-end 493``
(video duration is exactly 493s).

VETTING: Tseeky films in a practice/custom server, one steady lineup per
chapter with a short editor title card. NOT yet localized — spans will live in
``scripts/lotus_spans.md`` via the frame-study gate protocol (see
``scripts/LOCALIZE_INSTRUCTIONS_SOVA_LOTUS.md``). This script only creates the
stub rows.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via ``scripts/recut_lineup_clips.py`` (spans from
``lotus_spans.md``); zones+side via a future ``accept_sova_lotus_lineups.py``.

Utility types (valorant ``utility_type`` slugs):
  - recon  (Recon Bolt)  — ALL 23 rows. Every chapter is a dart-reveal arrow
    ("God Arrow", "Simple", "Backsite", "Info", "Retake"); this guide has NO
    Shock Bolt lineups (unlike Haven, which had 4 post-plant/Cypher-trap shocks).
If ``recon`` is somehow absent this script ABORTS fail-loud (see _resolve_ids) —
by design; re-run ``python -m app.cli load-fixtures`` first.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend (PG:5433 must be UP):
  .venv/Scripts/python.exe scripts/create_sova_lotus_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_sova_lotus_lineups.py
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

YOUTUBE_VIDEO_ID = "iGA1BeLmEqU"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "Tseeky"
GAME_SLUG = "valorant"
MAP_SLUG = "lotus"

# (chapter_start_seconds, name, utility_slug) — native chapter starts from
# `dump_chapters.py iGA1BeLmEqU` (24 chapters; #0 intro [0,7] excluded). Names
# match the native chapter titles verbatim. CONTIGUOUS (chapter_end = next
# start); the LAST row (457) needs `recut --chapter-end 493`.
LINEUPS: list[tuple[int, str, str]] = [
    (7,   "A Main God Arrow",                                                        "recon"),  # ce=24
    (24,  "A Tree God Arrow (Perfect timing with the rotating door)",                "recon"),  # ce=49
    (49,  "A Tree Simple",                                                           "recon"),  # ce=62
    (62,  "A Site 1 Backsite",                                                       "recon"),  # ce=82
    (82,  "A Site 2 Simple",                                                         "recon"),  # ce=100
    (100, "B God Arrow",                                                             "recon"),  # ce=122
    (122, "B Upper (Good midround arrow if your team doesn't have any smokes left)", "recon"),  # ce=143
    (143, "C Main God Arrow",                                                        "recon"),  # ce=163
    (163, "C God Arrow",                                                             "recon"),  # ce=185
    (185, "C Backsite",                                                              "recon"),  # ce=204
    (204, "A Main God Arrow 1 (Can be used for wallbangs)",                          "recon"),  # ce=234
    (234, "A Main God Arrow 2 (Can be used for wallbangs)",                          "recon"),  # ce=264
    (264, "A Main Simple",                                                           "recon"),  # ce=279
    (279, "A Main Info From B + Drone",                                              "recon"),  # ce=308  (recon + Owl Drone combo)
    (308, "C Early Info God Arrow",                                                  "recon"),  # ce=329
    (329, "C Early Info Simple",                                                     "recon"),  # ce=344
    (344, "A Retake + Drone",                                                        "recon"),  # ce=368  (recon + Owl Drone combo)
    (368, "A Retake Simple",                                                         "recon"),  # ce=384
    (384, "C Retake 1 Link (Try with 2 bounces too, scans backsite)",               "recon"),  # ce=403  (bounce variation)
    (403, "C Retake 2 CT",                                                           "recon"),  # ce=422
    (422, "B Retake 1 Heaven",                                                       "recon"),  # ce=440
    (440, "B Retake 2 C Link",                                                       "recon"),  # ce=457
    (457, "B Retake 3 A Link",                                                       "recon"),  # ce=493 (LAST — pass --chapter-end 493)
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
        raise SystemExit(f"ABORT — game slug {GAME_SLUG!r} not found "
                         f"(run `python -m app.cli load-fixtures`)")
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
        raise SystemExit(
            f"ABORT — utility slug(s) {missing} not found for {GAME_SLUG!r}. "
            f"Available: {sorted(util_id)}. Run `python -m app.cli load-fixtures` "
            f"to load app/fixtures/utility_types.json.")
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

        print("== create_sova_lotus_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=lotus)'}")
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
                print(f"    WOULD-CREATE cs={cs:<4} util={util_slug:<6} {name!r}")
                continue
            lineup = Lineup(**data)
            db.add(lineup)
            await db.flush()
            created_ids.append(str(lineup.id))
            print(f"    CREATE cs={cs:<4} util={util_slug:<6} id8={str(lineup.id)[:8]} {name!r}")

        if args.dry_run:
            print(f"\n[DRY-RUN] would create {len(LINEUPS) - skipped}, skip {skipped}. No writes.")
            return
        await db.commit()
        print(f"\nDONE — created {len(created_ids)}, skipped {skipped}. "
              f"new id8s: {[i[:8] for i in created_ids]}")


asyncio.run(main())
