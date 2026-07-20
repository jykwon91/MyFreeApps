"""Create the 30 pending Sova/Fracture lineups for Tseeky's guide video
(21kK2500UmA, "Sova Lineups Fracture 2025 *NEW*", uploaded 2025-01-09)
as a DIRECT DB write that BYPASSES the classifier-coupled ingestion orchestrator.

Same shape as ``create_sova_split_lineups.py`` (Split) / ``create_sova_pearl_lineups.py``
(Pearl) / ``create_sova_bind_lineups.py`` (Bind) / ``create_sova_lotus_lineups.py``
(Lotus) / ``create_sova_haven_lineups.py`` (Haven) / ``create_sova_lineups.py`` (Ascent)
/ ``create_sova_breeze_lineups.py`` (Breeze). EIGHTH Valorant ingest (after Ascent
MMni5F7Pfl0, Breeze 9STlc0XPsrw, Haven czketOpD2p8, Lotus iGA1BeLmEqU, Bind
bwgOsUZcgq8, Split k7GGhJ0NJCU, Pearl 3ATKevAGLMw).

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is PER-LINEUP chaptered (one named
chapter per lineup — the gold-standard format), so we enumerate the 30 lineup
chapters by hand here. ``dump_chapters.py 21kK2500UmA`` gave 31 native chapters
= 30 lineups + chapter#0 intro [0,7] (excluded). Chapters are CONTIGUOUS, so
``recut_lineup_clips.py`` auto-bounds each clip by the next row's start; the
LAST row (#30, cs=694) has no next row → pass ``recut --chapter-end 721``
(ffprobe duration is 720.041s; native chapter#30 ends 720.0; ceil = 721).

VETTING: Tseeky films in a practice/custom server, one steady lineup per
chapter with a short editor title card. NOT yet localized — spans will live in
``scripts/fracture_spans.md`` via the frame-study gate protocol (see
``scripts/LOCALIZE_INSTRUCTIONS_SOVA_FRACTURE.md``). This script only creates the
stub rows.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via ``scripts/recut_lineup_clips.py`` (spans from
``fracture_spans.md``); zones+side via a future ``accept_sova_fracture_lineups.py``.

Utility types (valorant ``utility_type`` slugs):
  - recon  (Recon Bolt)  — 24 rows. Every "God Arrow" / "Info" / "Retake" /
    "Main" / "Sand" / "Dish" / "Arcade" / "Spawn" / site-hit chapter is a
    dart-reveal arrow.
  - shock  (Shock Bolt)  — 6 rows: #25 ("B Default Shock Dart 1 (Main)"),
    #26 ("B Default Sneaky Shock Dart 2 (Heaven, TRY THIS!)"), #27 ("B Default
    Shock Dart 3 (Heaven)"), #28 ("B Corner Plant Shock Dart (Heaven)"),
    #29 ("A Open Plant Shock Dart (Drop)"), #30 ("A Main Plant Shock Dart").
    Tseeky labels shock lineups EXPLICITLY ("...Shock Dart") — those six titles
    are the only ones that say "Shock", so exactly six shock rows.
    NOTE #20 "A Main Fast Info Arrow (Try with shock dart too...)" is a RECON
    arrow whose title SUGGESTS a shock alternative — created recon (the primary
    demonstrated utility is the info arrow); the shock is only a "try this too"
    note, NOT a separate lineup. Confirm recon at frame study (stick + sonar).
Both ``recon`` and ``shock`` MUST exist or this script ABORTS fail-loud (see
_resolve_ids) — by design; re-run ``python -m app.cli load-fixtures`` first.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend (PG:5433 must be UP):
  .venv/Scripts/python.exe scripts/create_sova_fracture_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_sova_fracture_lineups.py
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

YOUTUBE_VIDEO_ID = "21kK2500UmA"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "Tseeky"
GAME_SLUG = "valorant"
MAP_SLUG = "fracture"

# (chapter_start_seconds, name, utility_slug) — native chapter starts from
# `dump_chapters.py 21kK2500UmA` (31 chapters; #0 intro [0,7] excluded). Names
# match the native chapter titles verbatim. CONTIGUOUS (chapter_end = next
# start); the LAST row (694) needs `recut --chapter-end 721` (ffprobe duration
# 720.041s → ceil 721).
LINEUPS: list[tuple[int, str, str]] = [
    (7,   "B Site God Arrow (Tree)",                          "recon"),  # ce=29
    (29,  "B Site/Main Arrow 1 (Tree)",                       "recon"),  # ce=55
    (55,  "B Site/Main Arrow 2 (Arcade)",                     "recon"),  # ce=91
    (91,  "B Arcade God Arrow",                               "recon"),  # ce=120
    (120, "B Arcade Arrow 2",                                 "recon"),  # ce=146
    (146, "A Main Arrow 1",                                   "recon"),  # ce=166
    (166, "A Main Arrow 2 Deep",                              "recon"),  # ce=188
    (188, "A Sand Arrow 1",                                   "recon"),  # ce=213
    (213, "A Sand Arrow 2",                                   "recon"),  # ce=234
    (234, "A Dish Arrow",                                     "recon"),  # ce=258
    (258, "A Site Simple Arrows (2 Variations, Drop & A Main)", "recon"),  # ce=294  (2 variations — localize the PRIMARY demo)
    (294, "B Main Tree God Arrow",                            "recon"),  # ce=317
    (317, "B Arcade Arrow 1 (Generator)",                    "recon"),  # ce=345
    (345, "B Arcade Arrow 2 (Barrier)",                      "recon"),  # ce=368
    (368, "B Retake God Arrow",                               "recon"),  # ce=393  (retake ⇒ likely defender)
    (393, "B Retake Simple Arrow",                           "recon"),  # ce=413  (retake ⇒ likely defender)
    (413, "Upper Spawn God Arrow (B Heaven)",                "recon"),  # ce=445
    (445, "Lower Spawn God Arrow 1 (B Site)",                "recon"),  # ce=475
    (475, "Lower Spawn God Arrow 2 (A Site)",                "recon"),  # ce=502
    (502, "A Main Fast Info Arrow (Try with shock dart too for big early round damage!)", "recon"),  # ce=532  (RECON primary; shock only a 'try too' note)
    (532, "A Main Wallbang Arrow",                           "recon"),  # ce=559  (wallbang recon arrow)
    (559, "A Main/Spawn Arrow",                               "recon"),  # ce=582
    (582, "A Retake Simple Arrows (2 variations)",           "recon"),  # ce=613  (2 variations — localize the PRIMARY demo; retake ⇒ likely defender)
    (613, "A Retake Arrow 2 (Scans the whole A main, great for mid round info too!)", "recon"),  # ce=631  (retake ⇒ likely defender)
    (631, "B Default Shock Dart 1 (Main)",                   "shock"),  # ce=649  (SHOCK — default/post-plant ⇒ attacker)
    (649, "B Default Sneaky Shock Dart 2 (Heaven, TRY THIS!)", "shock"),  # ce=661  (SHOCK — default/post-plant ⇒ attacker)
    (661, "B Default Shock Dart 3 (Heaven)",                 "shock"),  # ce=669  (SHOCK — default/post-plant ⇒ attacker)
    (669, "B Corner Plant Shock Dart (Heaven)",              "shock"),  # ce=677  (SHOCK — post-plant ⇒ attacker)
    (677, "A Open Plant Shock Dart (Drop)",                  "shock"),  # ce=694  (SHOCK — post-plant ⇒ attacker)
    (694, "A Main Plant Shock Dart",                          "shock"),  # ce=720 (LAST — pass --chapter-end 721; SHOCK — post-plant ⇒ attacker)
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
    existing_id = (await db.execute(
        text("SELECT id FROM source WHERE config_json->>'url' = :u"),
        {"u": VIDEO_URL})).scalar_one_or_none()
    if existing_id is not None:
        if not dry_run:
            # dict-merge agent_hint='sova' preserving existing keys (reassign a
            # new dict so SQLAlchemy tracks the JSON change).
            source = await db.get(Source, existing_id)
            cfg = dict(source.config_json or {})
            if cfg.get("agent_hint") != "sova":
                cfg["agent_hint"] = "sova"
                source.config_json = cfg
                await db.flush()
        return existing_id
    if dry_run:
        return None
    source = Source(
        kind="youtube_playlist",
        config_json={"url": VIDEO_URL, "map_hint": MAP_SLUG,
                     "game_hint": GAME_SLUG, "agent_hint": "sova"},
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

        print("== create_sova_fracture_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=fracture agent_hint=sova)'}")
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
