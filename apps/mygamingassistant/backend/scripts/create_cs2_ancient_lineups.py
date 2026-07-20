"""Create the 37 pending lineups for NartOutHere's Ancient nades guide video
(H9-LFlmPe4U, "The ONLY CS2 ANCIENT NADES GUIDE You'll EVER NEED", uploaded
2024-12-29) as a DIRECT DB write that BYPASSES the classifier-coupled ingestion
orchestrator. Same shape as ``create_cs2_vertigo_lineups.py`` /
``create_cs2_overpass_lineups.py`` / ``create_cs2_nuke_lineups.py`` /
``create_cs2_dust2_lineups.py`` / ``create_cs2_inferno_lineups.py``.

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is chaptered per named position (one
native chapter per nade or nade set — 38 chapters = 1 Intro (chapter 0, 0-44s) +
37 lineup chapters), so we enumerate the 37 lineup chapters by hand here.
``dump_chapters`` gave 38 native chapters.

VETTING (2026-07-08): NartOutHere is the gold-standard channel whose Inferno
smoke guide (2pSqBc6M10s), Dust 2 nades guide (voM-FpCNqtU), Nuke nades guide
(6_WAimVYF0I), Overpass nades guide (hGc4PNhGRQ0) and Vertigo smokes guide
(CR3cNNTPQs0) were frame-study ACCEPTED. THIS Ancient guide is the DIRECT
ANALOGUE of the accepted Overpass nades guide — a full NADES guide (smoke +
molotov + flash + HE), demo-style, one clean stand->aim->throw->landing per
single-nade chapter. Chapters are 4-86s (per-throw for singles, longer for the
grouped "… Nades"/"… Flashes"/"… Molotovs" sets), NOT the weak grouped-GOTV
compilation shape the task warns against. Rejected alternative (searched
2026-07-08): NartOutHere's 2023 "CS2 Ancient Nades You MUST Learn" (mW52eCD2Dr0)
has only 14 chapters, several COARSE grouped blocks (103s, 347s, 229s) = the weak
grouped shape (exactly what the Vertigo prep rejected in edmB2IPDBWU). H9-LFlmPe4U's
37 chapters (majority per-throw singles) are the best available Ancient source.
1920x1080 @ 60fps (av1), 1008.0s.

Like Overpass / Dust 2 / Nuke (and unlike the all-smoke Inferno + Vertigo), THIS
video is a full NADES guide — a MIX of utility: 24 smoke, 7 molotov, 4 flash,
2 grenade (HE). Utility slug per chapter comes from the native chapter title
(CS2 DB slugs: smoke, molotov, flash, grenade). MANY GROUPED "… Nades" / "…
Flashes" / "… Molotovs" / "… nadeset" chapters demonstrate 2-3+ throws; each is
created as ONE lineup keyed on the LEADING/likeliest utility, and the rest are
described in NOTES at localize time. TITLE-GUESS rows (bare "Nades"/"nadeset"/
"Grenade"/"Smoke Break" with no explicit utility) default to the likeliest slug
and MUST be CONFIRMED from the landing signature at localize time — re-classify
in NOTES if wrong. Several very short (4-6s) "X Nades" chapters (#08 A Nades,
#15 Cave Nades, #24 B Nades, #33 CT Nades) look like SECTION-HEADER / transition
cards — the localizer must confirm whether they carry a real throw and NOTE if
they are title cards only.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via frame study + ``scripts/recut_lineup_clips.py``;
zones+side via a ``scripts/accept_cs2_ancient_lineups.py`` (added at accept time).

Source: idempotently ensures a dedicated ``youtube_playlist`` source with the
fixed UUID ``1737f0e7-da70-4db5-8867-bca57939351f`` (matched by
``config_json->>'url'``); its ``config_json`` carries ``map_hint=ancient`` +
``game_hint=cs2`` (the single-map hard-lock the classifier scoping uses, #782).
NO agent_hint (that is Valorant/Sova-only).

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend:
  .venv/Scripts/python.exe scripts/create_cs2_ancient_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_cs2_ancient_lineups.py
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

YOUTUBE_VIDEO_ID = "H9-LFlmPe4U"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "NartOutHere"
GAME_SLUG = "cs2"
MAP_SLUG = "ancient"
SOURCE_UUID = "1737f0e7-da70-4db5-8867-bca57939351f"

# (chapter_start_seconds, name, utility_slug) — verbatim native chapter titles.
# chapter_start_seconds IS each lineup's clip-storage identity AND drives
# recut_lineup_clips.py's contiguous chapter_end (= next row's start). The 37
# starts are contiguous; the LAST row (997) has no next row, so pass
# `recut --chapter-end 1008` (ceil of the 1008.0s duration).
# MIX of utility (24 smoke / 7 molotov / 4 flash / 2 grenade). Utility per the
# LEADING/likeliest utility named in each native title (grouped/title-guess
# keyed to the primary; confirm at localize).
LINEUPS: list[tuple[int, str, str]] = [
    (44,  "Ancient mid control nades for t side",  "smoke"),    # ce=50   GROUPED (bare "nades") + TITLE-GUESS; T side; short (6s), poss. section header
    (50,  "Ancient Window smoke",                  "smoke"),    # ce=67
    (67,  "Ancient Mid donut smoke",               "smoke"),    # ce=83
    (83,  "Ancient Mid Flashes",                   "flash"),    # ce=169  GROUPED (plural, 86s)
    (169, "Ancient Mid Molotovs",                  "molotov"),  # ce=216  GROUPED (plural, 47s)
    (216, "Ancient Elbow Nade Smoke Break",        "smoke"),    # ce=231  TITLE-GUESS (could be HE breaking a smoke; "Smoke" -> smoke)
    (231, "Ancient Mid Grenade Stack",             "grenade"),  # ce=254  TITLE-GUESS (HE stack; confirm detonation)
    (254, "Ancient A Nades",                       "smoke"),    # ce=260  GROUPED (bare "Nades") + TITLE-GUESS; short (6s), poss. section header
    (260, "Ancient CT Smokes",                     "smoke"),    # ce=282  GROUPED (plural); CT side
    (282, "Ancient A Donut Smoke",                 "smoke"),    # ce=295
    (295, "Ancient FAST Donut Smoke",              "smoke"),    # ce=306
    (306, "Ancient A Smokes From 1 Position",      "smoke"),    # ce=337  GROUPED (plural, several smokes from one spot, 31s)
    (337, "Ancient A Molotovs",                    "molotov"),  # ce=355  GROUPED (plural, 18s)
    (355, "Ancient A Flashes",                     "flash"),    # ce=422  GROUPED (plural, 67s)
    (422, "Ancient Cave Nades",                    "smoke"),    # ce=427  GROUPED (bare "Nades") + TITLE-GUESS; short (5s), poss. section header
    (427, "Ancient Cheetah Smoke",                 "smoke"),    # ce=436
    (436, "Ancient Jaguar Smoke",                  "smoke"),    # ce=446
    (446, "Meta Ancient Cave Smoke",               "smoke"),    # ce=457
    (457, "Ancient Banana Molotov",                "molotov"),  # ce=476
    (476, "Brollan Ancient Cave Molotov",          "molotov"),  # ce=484  short (8s)
    (484, "Cave control nades",                    "smoke"),    # ce=494  GROUPED (bare "nades") + TITLE-GUESS
    (494, "Ancient Cave flashes",                  "flash"),    # ce=533  GROUPED (plural, 39s)
    (533, "Ancient B Door Flash",                  "flash"),    # ce=552
    (552, "Ancient B Nades",                       "smoke"),    # ce=557  GROUPED (bare "Nades") + TITLE-GUESS; short (5s), poss. section header
    (557, "Ancient B Lurk Smoke",                  "smoke"),    # ce=570  lurk (infer throwing origin from frames)
    (570, "CS2 ancient b nades from Door",         "smoke"),    # ce=599  GROUPED (bare "nades") + TITLE-GUESS
    (599, "Ancient B Long Smoke",                  "smoke"),    # ce=607  short (8s)
    (607, "Ancient B nadeset from B main",         "smoke"),    # ce=667  GROUPED ("nadeset") + TITLE-GUESS (60s)
    (667, "Ancient B Long molotovs",               "molotov"),  # ce=687  GROUPED (plural, 20s)
    (687, "Ancient B Ninja molotov",               "molotov"),  # ce=699
    (699, "Ancient B Postplant Molotov",           "molotov"),  # ce=708  postplant -> confirm side (T holding post-plant vs CT)
    (708, "Ancient B Grenade",                     "grenade"),  # ce=720  TITLE-GUESS (bare "Grenade" -> HE; confirm detonation)
    (720, "Ancient CT Nades",                      "smoke"),    # ce=724  GROUPED (bare "Nades") + TITLE-GUESS; CT side; short (4s), poss. section header
    (724, "cs2 ancient ct nades for mid",          "smoke"),    # ce=778  GROUPED (bare "nades") + TITLE-GUESS; CT side (54s)
    (778, "ancient ct b nades",                    "smoke"),    # ce=931  GROUPED (bare "nades") + TITLE-GUESS; CT side; long (153s)
    (931, "Ancient Retake Nades",                  "smoke"),    # ce=997  GROUPED (bare "Nades") + TITLE-GUESS; CT retake side (66s)
    (997, "m0NESY nades",                          "smoke"),    # ce=1008 (LAST -> --chapter-end 1008; video 1008.0s). GROUPED (bare "nades", pro-named) + TITLE-GUESS
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
        id=SOURCE_UUID,
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

        print("== create_cs2_ancient_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else f'(would CREATE {SOURCE_UUID} map_hint=ancient)'}")
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
