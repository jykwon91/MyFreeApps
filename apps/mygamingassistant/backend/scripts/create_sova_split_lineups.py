"""Create the 25 pending Sova/Split lineups for Tseeky's guide video
(k7GGhJ0NJCU, "Sova Lineups Split 2024 *NEW*", uploaded 2024-10-27)
as a DIRECT DB write that BYPASSES the classifier-coupled ingestion orchestrator.

Same shape as ``create_sova_bind_lineups.py`` (Bind) / ``create_sova_lotus_lineups.py``
(Lotus) / ``create_sova_haven_lineups.py`` (Haven) / ``create_sova_lineups.py``
(Ascent) / ``create_sova_breeze_lineups.py`` (Breeze). SIXTH Valorant ingest
(after Ascent MMni5F7Pfl0, Breeze 9STlc0XPsrw, Haven czketOpD2p8, Lotus
iGA1BeLmEqU, Bind bwgOsUZcgq8).

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is PER-LINEUP chaptered (one named
chapter per lineup — the gold-standard format), so we enumerate the 25 lineup
chapters by hand here. ``dump_chapters.py k7GGhJ0NJCU`` gave 26 native chapters
= 25 lineups + chapter#0 intro [0,7] (excluded). Chapters are CONTIGUOUS, so
``recut_lineup_clips.py`` auto-bounds each clip by the next row's start; the
LAST row (#25, cs=629) has no next row → pass ``recut --chapter-end 661``
(ffprobe duration is 660.154s; native chapter#25 ends 660.0; ceil = 661).

VETTING: Tseeky films in a practice/custom server, one steady lineup per
chapter with a short editor title card. NOT yet localized — spans will live in
``scripts/split_spans.md`` via the frame-study gate protocol (see
``scripts/LOCALIZE_INSTRUCTIONS_SOVA_SPLIT.md``). This script only creates the
stub rows.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via ``scripts/recut_lineup_clips.py`` (spans from
``split_spans.md``); zones+side via a future ``accept_sova_split_lineups.py``.

Utility types (valorant ``utility_type`` slugs):
  - recon  (Recon Bolt)  — 22 rows. Every "God Arrow" / "Info" / "Retake" /
    "Middle" / site-hit chapter is a dart-reveal arrow.
  - shock  (Shock Bolt)  — rows #23 ("A Site Post Plant Shock Dart") and
    #24 ("B Site Post Plant Shock Dart"). Tseeky labels shock lineups
    EXPLICITLY ("...Post Plant Shock Dart") — those two titles are the only
    ones that say "Shock", so exactly two shock rows.
  - ROW #25 "A Info God Drone" is a Sova **OWL DRONE**, NOT a Recon Bolt. There
    is NO ``owl-drone`` / ``drone`` slug in the valorant utility_type catalog
    (kit models recon + shock only), so it is created as ``recon`` as a
    PLACEHOLDER. This is flagged loudly in split_spans.md + the localize doc:
    reclassify utility_type_id at localization (or add an owl-drone fixture).
    The drone DEPLOY signature (a launched, flying drone) differs from an
    arrow-stick + blue sonar scan — the localizer must NOT treat it as an arrow.
Both ``recon`` and ``shock`` MUST exist or this script ABORTS fail-loud (see
_resolve_ids) — by design; re-run ``python -m app.cli load-fixtures`` first.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend (PG:5433 must be UP):
  .venv/Scripts/python.exe scripts/create_sova_split_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_sova_split_lineups.py
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

YOUTUBE_VIDEO_ID = "k7GGhJ0NJCU"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "Tseeky"
GAME_SLUG = "valorant"
MAP_SLUG = "split"

# (chapter_start_seconds, name, utility_slug) — native chapter starts from
# `dump_chapters.py k7GGhJ0NJCU` (26 chapters; #0 intro [0,7] excluded). Names
# match the native chapter titles verbatim. CONTIGUOUS (chapter_end = next
# start); the LAST row (629) needs `recut --chapter-end 661`.
LINEUPS: list[tuple[int, str, str]] = [
    (7,   "A Site God Arrow",                            "recon"),  # ce=35
    (35,  "A Back Site",                                 "recon"),  # ce=56
    (56,  "A Site Close (While jumping!)",               "recon"),  # ce=76   (jump-throw — title says "While jumping!")
    (76,  "A Ramp",                                      "recon"),  # ce=99
    (99,  "A Ramp 2 (Combo with ultimate)",             "recon"),  # ce=126  (ult-combo variation)
    (126, "A Heaven",                                    "recon"),  # ce=152
    (152, "B Site God Arrow 1",                          "recon"),  # ce=180
    (180, "B Site God Arrow 2",                          "recon"),  # ce=207
    (207, "B Site God Arrow 3",                          "recon"),  # ce=235
    (235, "Middle (Flies over Sage wall)",              "recon"),  # ce=260  (mid; clears/flies the Sage wall)
    (260, "A Info God Arrow 1",                          "recon"),  # ce=284
    (284, "A Info God Arrow 2 (Combo with ultimate)",   "recon"),  # ce=315  (ult-combo)
    (315, "A Retake God Arrow",                          "recon"),  # ce=344  (retake ⇒ likely defender)
    (344, "A Retake Simple",                             "recon"),  # ce=366  (retake ⇒ likely defender)
    (366, "B Info God Arrow (Combo with ultimate)",     "recon"),  # ce=396  (ult-combo)
    (396, "B Info 2 From A Ramp (Combo with ultimate)", "recon"),  # ce=429  (ult-combo; cast from A Ramp)
    (429, "B Info 3 Fast",                               "recon"),  # ce=455
    (455, "B Retake 1",                                  "recon"),  # ce=478  (retake ⇒ likely defender)
    (478, "B Retake 2",                                  "recon"),  # ce=498  (retake ⇒ likely defender)
    (498, "Middle 1 Fast",                               "recon"),  # ce=520
    (520, "Middle 2 From A Ramp",                        "recon"),  # ce=554  (cast from A Ramp)
    (554, "Middle 3 From A Rafters",                     "recon"),  # ce=583  (cast from A Rafters)
    (583, "A Site Post Plant Shock Dart",                "shock"),  # ce=607  (SHOCK — post-plant ⇒ attacker)
    (607, "B Site Post Plant Shock Dart",                "shock"),  # ce=629  (SHOCK — post-plant ⇒ attacker)
    (629, "A Info God Drone",                            "recon"),  # ce=660 (LAST — pass --chapter-end 661); OWL DRONE, not recon — placeholder (no drone slug)
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

        print("== create_sova_split_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=split)'}")
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
