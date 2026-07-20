"""Create the 33 pending Sova/Icebox lineups for Tseeky's guide video
(2PTNb8ouV7w, "Sova Lineups Icebox 2024 *NEW*") as a DIRECT DB write that
BYPASSES the classifier-coupled ingestion orchestrator.

Same shape as ``create_sova_fracture_lineups.py`` (Fracture) /
``create_sova_pearl_lineups.py`` (Pearl) / ``create_sova_split_lineups.py``
(Split) / the Bind/Lotus/Haven/Ascent/Breeze creators. NINTH Valorant ingest.

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is PER-LINEUP chaptered (one named
chapter per lineup — the gold-standard format), so we enumerate the 33 lineup
chapters by hand here. ``dump_chapters.py 2PTNb8ouV7w`` gave 34 native chapters
= 33 lineups + chapter#0 intro [0,7] (excluded). Chapters are CONTIGUOUS, so
``recut_lineup_clips.py`` auto-bounds each clip by the next row's start; the
LAST row (#33, cs=735) has no next row → pass ``recut --chapter-end 766``
(ffprobe duration is 765.161s; native chapter#33 ends 765.0; ceil = 766).

VETTING: Tseeky films in a practice/custom server, one steady lineup per
chapter with a short editor title card. NOT yet localized — spans will live in
``scripts/icebox_spans.md`` via the frame-study gate protocol (see
``scripts/LOCALIZE_INSTRUCTIONS_SOVA_ICEBOX.md``). This script only creates the
stub rows.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via ``scripts/recut_lineup_clips.py`` (spans from
``icebox_spans.md``); zones+side via a future ``accept_sova_icebox_lineups.py``.

Utility types (valorant ``utility_type`` slugs):
  - recon  (Recon Bolt)  — 30 rows. Every "God Arrow" / "Info" / "Simple" /
    "Retake" / "Support" / "Backsite" / "Pipes" / "Orb" / site-hit chapter is a
    dart-reveal arrow.
  - shock  (Shock Bolt)  — 3 rows: #22 ("A Post Plant"), #23 ("B Post Plant"),
    #28 ("B Post Plant"). Sova post-plant lineups are damage darts landing on
    the spike to deny/hurt defusers — a shock signature (detonate on impact, no
    stick + no sonar rings). This is INFERRED from the "Post Plant" callout;
    CONFIRM shock at frame study. If a "Post Plant" row instead sticks + emits
    sonar rings it is a recon post-plant INFO dart — reclassify then.
Both ``recon`` and ``shock`` MUST exist or this script ABORTS fail-loud (see
_resolve_ids) — by design; re-run ``python -m app.cli load-fixtures`` first.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend (PG:5433 must be UP):
  .venv/Scripts/python.exe scripts/create_sova_icebox_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_sova_icebox_lineups.py
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

YOUTUBE_VIDEO_ID = "2PTNb8ouV7w"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "Tseeky"
GAME_SLUG = "valorant"
MAP_SLUG = "icebox"

# (chapter_start_seconds, name, utility_slug) — native chapter starts from
# `dump_chapters.py 2PTNb8ouV7w` (34 chapters; #0 intro [0,7] excluded). Names
# match the native chapter titles verbatim. CONTIGUOUS (chapter_end = next
# start); the LAST row (735) needs `recut --chapter-end 766` (ffprobe duration
# 765.161s → ceil 766).
LINEUPS: list[tuple[int, str, str]] = [
    (7,   "A Site God Arrow",           "recon"),  # ce=39
    (39,  "A Site 2 Simple",            "recon"),  # ce=56
    (56,  "A 410",                      "recon"),  # ce=80
    (80,  "A Close",                    "recon"),  # ce=102
    (102, "B Main God Arrow",           "recon"),  # ce=129
    (129, "B Yellow God Arrow",         "recon"),  # ce=152
    (152, "B Yellow 2 Simple",          "recon"),  # ce=175
    (175, "B Site God Arrow",           "recon"),  # ce=199
    (199, "B Backsite",                 "recon"),  # ce=228
    (228, "Middle God Arrow",           "recon"),  # ce=249
    (249, "Middle + Tube",              "recon"),  # ce=274  (dual-target reveal)
    (274, "A Early Info God Arrow",     "recon"),  # ce=298
    (298, "A Support",                  "recon"),  # ce=321
    (321, "A Retake",                   "recon"),  # ce=340  (retake ⇒ likely defender)
    (340, "B Early Info God Arrow",     "recon"),  # ce=365
    (365, "B Main + Middle",            "recon"),  # ce=388  (dual-target reveal)
    (388, "B Retake God Arrow",         "recon"),  # ce=416  (retake ⇒ likely defender)
    (416, "B Support God Arrow",        "recon"),  # ce=446
    (446, "Middle Info God Arrow",      "recon"),  # ce=467
    (467, "Middle 2",                   "recon"),  # ce=489
    (489, "A Orb Early Round",          "recon"),  # ce=502  (recon info dart early round)
    (502, "A Post Plant",               "shock"),  # ce=518  (SHOCK — post-plant damage dart ⇒ attacker; CONFIRM detonation)
    (518, "B Post Plant",               "shock"),  # ce=533  (SHOCK — post-plant damage dart ⇒ attacker; CONFIRM detonation)
    (533, "A Pipes 1",                  "recon"),  # ce=557
    (557, "A Pipes 2",                  "recon"),  # ce=582
    (582, "A Site 3 God Arrow",         "recon"),  # ce=603
    (603, "B Main God Arrow 2",         "recon"),  # ce=625
    (625, "B Post Plant",               "shock"),  # ce=646  (SHOCK — post-plant damage dart ⇒ attacker; CONFIRM detonation)
    (646, "A Retake 2",                 "recon"),  # ce=666  (retake ⇒ likely defender)
    (666, "B Early Info God Arrow 2",   "recon"),  # ce=688
    (688, "B Support 2",                "recon"),  # ce=711
    (711, "B Retake 2",                 "recon"),  # ce=735  (retake ⇒ likely defender)
    (735, "B Retake 3",                 "recon"),  # ce=765 (LAST — pass --chapter-end 766; retake ⇒ likely defender)
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

        print("== create_sova_icebox_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=icebox agent_hint=sova)'}")
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
