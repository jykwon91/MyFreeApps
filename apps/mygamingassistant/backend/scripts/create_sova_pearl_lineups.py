"""Create the 29 pending Sova/Pearl lineups for Tseeky's guide video
(3ATKevAGLMw, "Sova Lineups Pearl 2024 *NEW*", uploaded 2024-10-24)
as a DIRECT DB write that BYPASSES the classifier-coupled ingestion orchestrator.

Same shape as ``create_sova_split_lineups.py`` (Split) / ``create_sova_bind_lineups.py``
(Bind) / ``create_sova_lotus_lineups.py`` (Lotus) / ``create_sova_haven_lineups.py``
(Haven) / ``create_sova_lineups.py`` (Ascent) / ``create_sova_breeze_lineups.py``
(Breeze). SEVENTH Valorant ingest (after Ascent MMni5F7Pfl0, Breeze 9STlc0XPsrw,
Haven czketOpD2p8, Lotus iGA1BeLmEqU, Bind bwgOsUZcgq8, Split k7GGhJ0NJCU).

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is PER-LINEUP chaptered (one named
chapter per lineup — the gold-standard format), so we enumerate the 29 lineup
chapters by hand here. ``dump_chapters.py 3ATKevAGLMw`` gave 30 native chapters
= 29 lineups + chapter#0 intro [0,7] (excluded). Chapters are CONTIGUOUS, so
``recut_lineup_clips.py`` auto-bounds each clip by the next row's start; the
LAST row (#29, cs=673) has no next row → pass ``recut --chapter-end <ceil(dur)>``
(yt-dlp metadata duration is 700s; native chapter#29 ends 700.0; confirm the
exact ffprobe duration and use its ceil — see scripts/pearl_spans.md).

VETTING: Tseeky films in a practice/custom server, one steady lineup per
chapter with a short editor title card. NOT yet localized — spans will live in
``scripts/pearl_spans.md`` via the frame-study gate protocol (see
``scripts/LOCALIZE_INSTRUCTIONS_SOVA_PEARL.md``). This script only creates the
stub rows.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via ``scripts/recut_lineup_clips.py`` (spans from
``pearl_spans.md``); zones+side via a future ``accept_sova_pearl_lineups.py``.

Utility types (valorant ``utility_type`` slugs):
  - recon  (Recon Bolt)  — 25 rows. Every "God Arrow" / "Info" / "Retake" /
    "Middle" / "Main" / "Art" / "Link" / site-hit chapter is a dart-reveal arrow.
  - shock  (Shock Bolt)  — 4 rows: #5 ("A Site Post Plant"), #12 ("B Post Plant
    Arrow"), #28 ("A Site Post Plant"), #29 ("B Site Post Plant"). Tseeky labels
    these as "Post Plant" — post-plant Sova darts are shock (damage/deny darts).
    NOTE #12 "B Post Plant Arrow" ALSO says "Arrow" — created shock by the
    post-plant rule, but CONFIRM shock-vs-recon from the LANDING signature at
    frame study (detonate=shock, stick+sonar=recon) and reclassify if needed.
  - ROW #6 "A Link + A Site Drone Combo" involves a Sova **OWL DRONE** (title
    says "Drone", no "bolt"). There is NO ``owl-drone`` / ``drone`` slug in the
    valorant utility_type catalog (kit models recon + shock only), so it is
    created as ``recon`` as a PLACEHOLDER. This is flagged loudly in
    pearl_spans.md + the localize doc: reclassify utility_type_id at
    localization (or add an owl-drone fixture). The drone DEPLOY signature (a
    launched, flying drone) differs from an arrow-stick + blue sonar scan — the
    localizer must NOT treat it as an arrow. It is a COMBO (an A Link arrow + an
    A Site drone); localize the PRIMARY demo and note the combo.
Both ``recon`` and ``shock`` MUST exist or this script ABORTS fail-loud (see
_resolve_ids) — by design; re-run ``python -m app.cli load-fixtures`` first.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend (PG:5433 must be UP):
  .venv/Scripts/python.exe scripts/create_sova_pearl_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_sova_pearl_lineups.py
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

YOUTUBE_VIDEO_ID = "3ATKevAGLMw"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "Tseeky"
GAME_SLUG = "valorant"
MAP_SLUG = "pearl"

# (chapter_start_seconds, name, utility_slug) — native chapter starts from
# `dump_chapters.py 3ATKevAGLMw` (30 chapters; #0 intro [0,7] excluded). Names
# match the native chapter titles verbatim. CONTIGUOUS (chapter_end = next
# start); the LAST row (673) needs `recut --chapter-end <ceil(dur)>` (metadata
# duration 700s → confirm ffprobe, ceil ~= 701).
LINEUPS: list[tuple[int, str, str]] = [
    (7,   "A Main 1",                                       "recon"),  # ce=28
    (28,  "A Main 2",                                       "recon"),  # ce=49
    (49,  "A Site God Arrow (Scans back site fully)",       "recon"),  # ce=81
    (81,  "A Site God Arrow 2 (Scans link too)",            "recon"),  # ce=105
    (105, "A Site Post Plant",                              "shock"),  # ce=122  (SHOCK — post-plant ⇒ attacker)
    (122, "A Link + A Site Drone Combo (Use when doing A split)", "recon"),  # ce=156  OWL DRONE combo — placeholder recon (no drone slug); RECLASSIFY
    (156, "A Art Wallbang (Lands behind enemies)",          "recon"),  # ce=182  (wallbang recon arrow)
    (182, "A Art Simple",                                   "recon"),  # ce=203
    (203, "B Long/Site",                                    "recon"),  # ce=232
    (232, "B Site God Arrow",                               "recon"),  # ce=257
    (257, "B Back Site",                                    "recon"),  # ce=281
    (281, "B Post Plant Arrow",                             "shock"),  # ce=309  (SHOCK — post-plant ⇒ attacker; title also says "Arrow" — CONFIRM shock-vs-recon at frame study)
    (309, "B Split Arrow (Mid Doors)",                      "recon"),  # ce=331  (recon arrow used during B split)
    (331, "Mid Doors God Arrow",                            "recon"),  # ce=354
    (354, "B Link God Arrow",                               "recon"),  # ce=376
    (376, "A Info",                                         "recon"),  # ce=397
    (397, "A Info 2 Art Wallbang",                          "recon"),  # ce=416  (wallbang recon arrow)
    (416, "A Retake God Arrow",                             "recon"),  # ce=437  (retake ⇒ likely defender)
    (437, "A Retake 2 Simple",                              "recon"),  # ce=461  (retake ⇒ likely defender)
    (461, "A Support",                                      "recon"),  # ce=489
    (489, "B Info",                                         "recon"),  # ce=512
    (512, "B Long",                                         "recon"),  # ce=531
    (531, "B Retake God Arrow",                             "recon"),  # ce=558  (retake ⇒ likely defender)
    (558, "B Retake 2 Simple",                              "recon"),  # ce=579  (retake ⇒ likely defender)
    (579, "B Support (2 variations)",                       "recon"),  # ce=611  (2 variations — localize the primary demo)
    (611, "Middle God Arrow",                               "recon"),  # ce=632
    (632, "Middle 2 Simple",                                "recon"),  # ce=654
    (654, "A Site Post Plant",                              "shock"),  # ce=673  (SHOCK — post-plant ⇒ attacker)
    (673, "B Site Post Plant",                              "shock"),  # ce=700 (LAST — pass --chapter-end <ceil(dur)>; SHOCK — post-plant ⇒ attacker)
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

        print("== create_sova_pearl_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=pearl agent_hint=sova)'}")
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
