"""Create the 24 pending lineups for NartOutHere's Nuke nades guide video
(6_WAimVYF0I, "Essential CS2 NUKE Nades Guide - MUST KNOW (2026)", uploaded
2025-01-08) as a DIRECT DB write that BYPASSES the classifier-coupled ingestion
orchestrator. Same shape as ``create_cs2_dust2_lineups.py`` /
``create_cs2_inferno_lineups.py`` / ``create_anubis_lineups.py``.

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is chaptered per named position (one
native chapter per nade or grouped-nade position — the demo-style format like
the accepted Inferno / Dust 2 videos), so we enumerate the 24 lineup chapters by
hand here. ``dump_chapters`` gave 25 native chapters = 1 Intro (chapter 0,
0-40s) + 24 lineups.

VETTING (2026-07-08): NartOutHere is the gold-standard channel whose Inferno
smoke guide (2pSqBc6M10s) and Dust 2 nades guide (voM-FpCNqtU) were frame-study
ACCEPTED. THIS Nuke guide is the same demo-style FIT — first-person practice
server, steady single-take stand->aim->throw->landing per chapter. Confirmed by
coarse contact-sheets of 2 sample chapters: "cs2 nuke main smoke" (outside/yard
stand -> aim -> throw with trajectory arc -> smoke bloom at A Main doorway) and
"fast cs2 nuke top hut molotov" (green molotov bottle -> throw -> molly FLAMES
igniting on Top Hut rooftop). Events pinned by MODE-INVARIANT signals (player at
spot / nade leaving hand / smoke bloom / molly flames); the practice trajectory
arc is orient-only. 1920x1080@60fps, 1147.433s.

Like Dust 2 (and unlike the all-smoke Inferno), THIS video is a full NADES guide
— a MIX of utility: 20 smoke, 3 molotov, 1 grenade (HE). NO flash chapters are
titled (grouped "… nades" chapters may contain flashes/mollys — localize the
PRIMARY smoke and note the rest). Utility slug per chapter comes from the native
chapter title (CS2 DB slugs: smoke, molotov, flash, grenade). Several GROUPED
"… nades" chapters (#01 yard, #14 outside, #15 upper, #20 upper execute, #22
ramp, #23 lower, #24 ct) mix utilities; each is created as ONE primary lineup
(smoke — the leading utility) and the rest are described in NOTES at localize
time. #21 "cs2 nuke grenades" is classified `grenade` (HE) as the literal title
reading — the localizer must CONFIRM from the landing signature (HE detonation
vs smoke bloom) and re-classify in NOTES if it is actually a smoke set.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via frame study + ``scripts/recut_lineup_clips.py``;
zones+side via a ``scripts/accept_cs2_nuke_lineups.py`` (added at accept time).

Source: idempotently ensures a dedicated ``youtube_playlist`` source matched by
``config_json->>'url'``; its ``config_json`` carries ``map_hint=nuke`` +
``game_hint=cs2`` (the single-map hard-lock the classifier scoping uses, #782).
NO agent_hint (that is Valorant/Sova-only).

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend:
  .venv/Scripts/python.exe scripts/create_cs2_nuke_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_cs2_nuke_lineups.py
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

YOUTUBE_VIDEO_ID = "6_WAimVYF0I"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "NartOutHere"
GAME_SLUG = "cs2"
MAP_SLUG = "nuke"

# (chapter_start_seconds, name, utility_slug) — verbatim native chapter titles.
# chapter_start_seconds IS each lineup's clip-storage identity AND drives
# recut_lineup_clips.py's contiguous chapter_end (= next row's start). The 24
# starts are contiguous; the LAST row (781) has no next row, so pass
# `recut --chapter-end 1148` (ceil of the 1147.433s duration).
# MIX of utility (20 smoke / 3 molotov / 1 grenade). Utility per native title.
LINEUPS: list[tuple[int, str, str]] = [
    (40,   "cs2 nuke yard nades",             "smoke"),    # ce=101  (GROUPED mixed, 61s)
    (101,  "cs2 nuke smoke wall - faze",      "smoke"),    # ce=120
    (120,  "solo nuke outside wall smoke",    "smoke"),    # ce=133
    (133,  "easy nuke outside smoke wall",    "smoke"),    # ce=151
    (151,  "cs2 nuke outside smokes wall",    "smoke"),    # ce=170
    (170,  "secret nuke smoke wall",          "smoke"),    # ce=181
    (181,  "standard cs2 nuke smoke wall",    "smoke"),    # ce=192
    (192,  "cs2 nuke outside smokes",         "smoke"),    # ce=198  (grouped short, 6s)
    (198,  "cs2 nuke top main smoke",         "smoke"),    # ce=212
    (212,  "cs2 nuke main smoke",             "smoke"),    # ce=222
    (222,  "cs2 nuke mini smoke",             "smoke"),    # ce=231
    (231,  "cs2 nuke locker smoke",           "smoke"),    # ce=239
    (239,  "cs2 nuke window smoke",           "smoke"),    # ce=250
    (250,  "cs2 nuke outside nades",          "smoke"),    # ce=379  (GROUPED mixed, 129s)
    (379,  "cs2 nuke upper nades",            "smoke"),    # ce=384  (grouped short, 5s)
    (384,  "cs2 nuke door lurk smoke",        "smoke"),    # ce=414
    (414,  "fast cs2 nuke top hut molotov",   "molotov"),  # ce=428
    (428,  "nuke top hut molotov",            "molotov"),  # ce=443
    (443,  "how to molotov top hut on nuke",  "molotov"),  # ce=467
    (467,  "cs2 nuke upper execute nades",    "smoke"),    # ce=655  (GROUPED EXECUTE, 188s)
    (655,  "cs2 nuke grenades",               "grenade"),  # ce=698  (HE? confirm from detonation)
    (698,  "cs2 nuke ramp nades",             "smoke"),    # ce=751  (GROUPED mixed, 53s)
    (751,  "cs2 nuke lower nades",            "smoke"),    # ce=781  (GROUPED mixed, 30s)
    (781,  "cs2 nuke ct nades",               "smoke"),    # ce=1148 (GROUPED CT mixed, 367s; LAST → --chapter-end 1148)
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

        print("== create_cs2_nuke_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=nuke)'}")
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
