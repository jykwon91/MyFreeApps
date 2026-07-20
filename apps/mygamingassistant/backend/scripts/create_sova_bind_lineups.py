"""Create the 25 pending Sova/Bind lineups for Tseeky's guide video
(bwgOsUZcgq8, "Sova Lineups Bind - Valorant Guide *NEW*", uploaded 2023-09-08)
as a DIRECT DB write that BYPASSES the classifier-coupled ingestion orchestrator.

Same shape as ``create_sova_lotus_lineups.py`` (Lotus) / ``create_sova_haven_lineups.py``
(Haven) / ``create_sova_lineups.py`` (Ascent) / ``create_sova_breeze_lineups.py``
(Breeze). Fifth Valorant ingest (after Ascent MMni5F7Pfl0, Breeze 9STlc0XPsrw,
Haven czketOpD2p8, Lotus iGA1BeLmEqU).

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is PER-LINEUP chaptered (one named
chapter per lineup — the gold-standard format), so we enumerate the 25 lineup
chapters by hand here. ``dump_chapters.py bwgOsUZcgq8`` gave 26 native chapters
= 25 lineups + chapter#0 intro [0,8] (excluded). Chapters are CONTIGUOUS, so
``recut_lineup_clips.py`` auto-bounds each clip by the next row's start; the
LAST row (#25, cs=560) has no next row → pass ``recut --chapter-end 600``
(video duration is exactly 600s).

VETTING: Tseeky films in a practice/custom server, one steady lineup per
chapter with a short editor title card. NOT yet localized — spans will live in
``scripts/bind_spans.md`` via the frame-study gate protocol (see
``scripts/LOCALIZE_INSTRUCTIONS_SOVA_BIND.md``). This script only creates the
stub rows.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via ``scripts/recut_lineup_clips.py`` (spans from
``bind_spans.md``); zones+side via a future ``accept_sova_bind_lineups.py``.

Utility types (valorant ``utility_type`` slugs):
  - recon  (Recon Bolt)  — ALL 25 rows. Every chapter is a dart-reveal arrow
    ("God Arrow", "Simple", "Backsite", "Bath", "Support", "Retake",
    "Afterplant"); this guide has NO Shock Bolt lineups. Rationale: Tseeky
    labels shock lineups EXPLICITLY (Haven's shocks were titled "...Post Plant
    Shock Darts" / "Shock Dart For Cypher Traps") — no Bind title contains
    "Shock", so every row is recon. NOTE: rows #6 "A Site Afterplant" and #12
    "B Site Afterplant" are afterplant reveals; if a frame-study LANDING shows a
    detonation (not an arrow stick + blue sonar scan) they are actually shock —
    reclassify utility_type_id at that point.
If ``recon`` is somehow absent this script ABORTS fail-loud (see _resolve_ids) —
by design; re-run ``python -m app.cli load-fixtures`` first.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend (PG:5433 must be UP):
  .venv/Scripts/python.exe scripts/create_sova_bind_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_sova_bind_lineups.py
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

YOUTUBE_VIDEO_ID = "bwgOsUZcgq8"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "Tseeky"
GAME_SLUG = "valorant"
MAP_SLUG = "bind"

# (chapter_start_seconds, name, utility_slug) — native chapter starts from
# `dump_chapters.py bwgOsUZcgq8` (26 chapters; #0 intro [0,8] excluded). Names
# match the native chapter titles verbatim. CONTIGUOUS (chapter_end = next
# start); the LAST row (560) needs `recut --chapter-end 600`.
LINEUPS: list[tuple[int, str, str]] = [
    (8,   "A Site God Arrow 1",                                                           "recon"),  # ce=34
    (34,  "A Site God Arrow 2 (Simple variation)",                                        "recon"),  # ce=45
    (45,  "A Site God Arrow 3",                                                           "recon"),  # ce=72
    (72,  "A Backsite",                                                                   "recon"),  # ce=93
    (93,  "A Bath",                                                                       "recon"),  # ce=115
    (115, "A Site Afterplant",                                                            "recon"),  # ce=138  (afterplant reveal — confirm not shock at frame-study)
    (138, "B Long",                                                                       "recon"),  # ce=164
    (164, "B Garden God Arrow (Lands hidden)",                                            "recon"),  # ce=191
    (191, "B Hookah God Arrow (Very hard but very good, especially against eco rounds)",  "recon"),  # ce=221
    (221, "B Site God Arrow",                                                             "recon"),  # ce=243
    (243, "B Site Simple",                                                                "recon"),  # ce=261
    (261, "B Site Afterplant",                                                            "recon"),  # ce=278  (afterplant reveal — confirm not shock at frame-study)
    (278, "A Short God Arrow",                                                            "recon"),  # ce=302
    (302, "A Bath God Arrow",                                                             "recon"),  # ce=329
    (329, "B Short (Outside hookah)",                                                     "recon"),  # ce=353
    (353, "B Long God Arrow",                                                             "recon"),  # ce=376
    (376, "B Support 1",                                                                  "recon"),  # ce=403
    (403, "B Support 2 (Risky variation)",                                                "recon"),  # ce=420
    (420, "B Support 3",                                                                  "recon"),  # ce=448
    (448, "A Support 1",                                                                  "recon"),  # ce=474
    (474, "A Support 2",                                                                  "recon"),  # ce=498
    (498, "A Retake 1",                                                                   "recon"),  # ce=518
    (518, "A Retake 2",                                                                   "recon"),  # ce=539
    (539, "B Retake 1",                                                                   "recon"),  # ce=560
    (560, "B Retake 2",                                                                   "recon"),  # ce=600 (LAST — pass --chapter-end 600)
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

        print("== create_sova_bind_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=bind)'}")
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
