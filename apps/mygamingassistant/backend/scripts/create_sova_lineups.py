"""Create the 39 pending Sova/Ascent lineups for Tseeky's guide video
(MMni5F7Pfl0, "Sova Lineups Ascent 2026", uploaded 2026-04-29) as a DIRECT DB
write that BYPASSES the classifier-coupled ingestion orchestrator.

Same shape as ``create_cache_lineups.py`` / ``create_anubis_lineups.py``. This
is the FIRST Valorant ingest; everything else in the library is CS2.

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is PER-LINEUP chaptered (one named
chapter per lineup — the gold-standard format), so we enumerate the 39 lineup
chapters by hand here. ``dump_chapters.py MMni5F7Pfl0`` gave 40 native chapters
= 39 lineups + chapter#0 intro [0,6] (excluded). Chapters are CONTIGUOUS, so
``recut_lineup_clips.py`` auto-bounds each clip by the next row's start; the
LAST row (#39, cs=750) has no next row → pass ``recut --chapter-end 780``.

VETTING: Tseeky films in a practice/custom server, one steady lineup per
chapter with a short editor title card. Localized 2026-06-16 by dense full-res
frame study + verify_events content card (NOT timestamp offsets) — spans live in
``scripts/sova_spans.md``. Localization is the authoritative record; this script
only creates the stub rows.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via ``scripts/recut_lineup_clips.py`` (spans from
``sova_spans.md``); zones+side via ``scripts/accept_sova_lineups.py``.

Utility types (valorant ``utility_type`` slugs):
  - recon  (Recon Bolt)  — #1-34, all the dart-reveal lineups.
  - shock  (Shock Bolt)  — #35-39, the trap-clear / damage darts.
PREREQUISITE: the valorant fixture (``app/fixtures/utility_types.json``) ships
only smoke/flash/molotov/recon — it has NO ``shock`` type. Before running this,
ADD ``{"slug": "shock", "name": "Shock Bolt"}`` to the valorant utility_types on
the FEATURE branch and re-run ``python -m app.cli load-fixtures``. If ``shock``
is absent this script ABORTS fail-loud (see _resolve_ids) — by design.

#2 "DEF A Main 2 (Ultimate Combo)" is an ult-combo gimmick; there is no ``ult``
utility type and adding one for a single lineup is needless. It is stored as
``recon`` (the lineup's reusable signal is the recon arrow placement). Operator
may reclassify or drop it on the glance board. Flagged in sova_spans.md.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend (PG:5433 must be UP):
  .venv/Scripts/python.exe scripts/create_sova_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_sova_lineups.py
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

YOUTUBE_VIDEO_ID = "MMni5F7Pfl0"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "Tseeky"
GAME_SLUG = "valorant"
MAP_SLUG = "ascent"

# (chapter_start_seconds, name, utility_slug) — native chapter starts from
# `dump_chapters.py MMni5F7Pfl0` (40 chapters; #0 intro [0,6] excluded). Names
# match sova_spans.md / the verify cards. CONTIGUOUS (chapter_end = next start);
# the LAST row (750) needs `recut --chapter-end 780`.
LINEUPS: list[tuple[int, str, str]] = [
    (6,   "DEF A Main",                    "recon"),  # ce=22
    (22,  "DEF A Main 2 (Ultimate Combo)", "recon"),  # ce=47  (ult-combo; stored recon — see docstring)
    (47,  "DEF A Main 3 Fast",             "recon"),  # ce=67
    (67,  "DEF A Lobby/Top Mid God Arrow", "recon"),  # ce=86
    (86,  "DEF A Retake God Arrow",        "recon"),  # ce=102
    (102, "DEF A Retake 2 Simple",         "recon"),  # ce=120
    (120, "DEF A Support",                 "recon"),  # ce=145
    (145, "DEF A Support 2",               "recon"),  # ce=166
    (166, "DEF B Main/Lobby Fast Info",    "recon"),  # ce=184
    (184, "DEF B Site Market Wallbang",    "recon"),  # ce=205
    (205, "DEF B Lobby God Arrow",         "recon"),  # ce=226
    (226, "DEF B Lobby 2 Simple",          "recon"),  # ce=246
    (246, "DEF B Retake",                  "recon"),  # ce=269
    (269, "DEF B Retake 2 (If smoked)",    "recon"),  # ce=287
    (287, "DEF Middle",                    "recon"),  # ce=309
    (309, "DEF Middle 2",                  "recon"),  # ce=328
    (328, "ATT A Main",                    "recon"),  # ce=345
    (345, "ATT A Wine",                    "recon"),  # ce=362
    (362, "ATT A Site Close",              "recon"),  # ce=379
    (379, "ATT A Site 2 God Arrow",        "recon"),  # ce=399
    (399, "ATT A Site 3 Hidden Arrow",     "recon"),  # ce=418
    (418, "ATT A Site 4 Simple",           "recon"),  # ce=436
    (436, "ATT A Site 5 Middle",           "recon"),  # ce=455
    (455, "ATT A Site 6 Post Plant Pop Recon", "recon"),  # ce=473
    (473, "ATT A Tree",                    "recon"),  # ce=495
    (495, "ATT A Heaven Wallbang (2 variations)", "recon"),  # ce=516  (LOW: throw cut-masked)
    (516, "ATT B Front Site",              "recon"),  # ce=537
    (537, "ATT B Front Site 2",            "recon"),  # ce=556
    (556, "ATT B Front Site 3 Close",      "recon"),  # ce=574
    (574, "ATT B Site",                    "recon"),  # ce=592
    (592, "ATT B Site 2 Simple",           "recon"),  # ce=611
    (611, "ATT B Market",                  "recon"),  # ce=632
    (632, "ATT Mid God Arrow (Mid Link)",  "recon"),  # ce=654
    (654, "ATT Mid God Arrow 2 (Top Mid)", "recon"),  # ce=672
    (672, "SHOCK A Site Cypher Traps",     "shock"),  # ce=688
    (688, "SHOCK A Default (2 variations)", "shock"),  # ce=716  (2nd variation ~703-714 = candidate)
    (716, "SHOCK A Dice",                  "shock"),  # ce=732
    (732, "SHOCK B Site Cypher Traps",     "shock"),  # ce=750
    (750, "SHOCK B Default",               "shock"),  # ce=780  (LAST — pass --chapter-end 780)
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
            f"Available: {sorted(util_id)}. If 'shock' is missing, add "
            f"{{\"slug\": \"shock\", \"name\": \"Shock Bolt\"}} to the valorant "
            f"utility_types in app/fixtures/utility_types.json and re-run load-fixtures.")
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

        print("== create_sova_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=ascent)'}")
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
