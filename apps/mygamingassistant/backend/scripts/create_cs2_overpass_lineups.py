"""Create the 71 pending lineups for NartOutHere's Overpass nades guide video
(hGc4PNhGRQ0, "CS2 Overpass Nades Guide (2026) — Every Smoke, Molotov & Flash
You'll Ever Need", uploaded 2025-09-03) as a DIRECT DB write that BYPASSES the
classifier-coupled ingestion orchestrator. Same shape as
``create_cs2_nuke_lineups.py`` / ``create_cs2_dust2_lineups.py`` /
``create_cs2_inferno_lineups.py`` / ``create_anubis_lineups.py``.

Why bypass the orchestrator: it is wired to yt-dlp + the Claude
classifier/localizer pipeline. This video is chaptered per named position (one
native chapter per single nade — 72 chapters = 1 Intro (chapter 0, 0-42s) + 71
lineups), so we enumerate the 71 lineup chapters by hand here.

VETTING (2026-07-08): NartOutHere is the gold-standard channel whose Inferno
smoke guide (2pSqBc6M10s), Dust 2 nades guide (voM-FpCNqtU) and Nuke nades guide
(6_WAimVYF0I) were frame-study ACCEPTED. Those were PRACTICE-SERVER demos. **This
Overpass guide is DIFFERENT — it is GOTV-pro-demo-sourced** (first-person POV
lifted from real pro match demos: scoreboards show Astralis/Vitality/G2/NAVI/FaZe
/Spirit, and the bottom HUD reads "Turn X-Ray On / [MOUSE1] Next Player /
[MWHEELUP] Camera / [SHIFT] Overview" = GOTV playback). NartOutHere has NO
practice-server Overpass guide, and no better practice-server chaptered Overpass
source exists (searched 2026-07-08; only nade-database websites + generic
jumpthrow-bind guides). Its SIBLING GOTV video o7QSytMKqvE is THIRD-PERSON and
therefore WORSE (no clean first-person crosshair-on-alignment-pixel = no good AIM
event); THIS one is FIRST-PERSON, so the thrower's crosshair on the alignment
pixel IS visible — the single most important lineup frame.

Crucially, this is NOT the weak "grouped GOTV compilation" shape the task warns
about (nuke's grouped GOTV chapters were the weakest). Each of the 71 chapters is
a SINGLE named nade (5–32s each), one clean pro throw per chapter from the
thrower's first-person POV — stand → aim (crosshair on pixel) → throw (nade
leaves hand) → landing (bloom/flames/pop/detonation). Confirmed demo-style by
coarse contact-sheets of 3 sample chapters: "Toliet Smoke" (T-Start stand with
smoke in hand → destination smoke at the Tickets/subway entrance), "Party
Molotov" and "Fountain Flash". GOTV CAVEATS the localizer must handle: the camera
can switch players mid-chapter (spectate demo), enemy X-Ray silhouettes are
overlaid, and the landing can be cut short — pin each event to its MODE-INVARIANT
signal INSIDE the chapter, exactly as for a practice-server source.

Like Dust 2 / Nuke (and unlike the all-smoke Inferno), THIS video is a full NADES
guide — a MIX of utility: 29 smoke, 20 molotov, 20 flash, 2 grenade (HE).
Utility slug per chapter comes from the native chapter title (CS2 DB slugs:
smoke, molotov, flash, grenade). Several GROUPED "… Nades"/"… Flashes"/"…
Molotovs" chapters and COMBO "A & B (& C)" / "X, Y, Z" chapters mix or repeat
utilities; each is created as ONE lineup keyed on the LEADING utility named in
the title (the primary throw), and the rest are described in NOTES at localize
time. Two HE-titled chapters (#51 "Woodwall HE Nade", #56 "Shortpipe HE Nade")
are classified `grenade`. #69 "T Stairs Nade" is a bare-"Nade" TITLE GUESS
(classified `smoke`) — the localizer must CONFIRM from the landing signature and
re-classify in NOTES if wrong.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No localization (stand/aim/throw/landing timestamps stay NULL).
  - No zones / side — those are ACCEPTANCE-time fields, NULL-exempt on pending
    rows (ck_lineup_accepted_classified gates on status='accepted').
Clips/localization come LATER via frame study + ``scripts/recut_lineup_clips.py``;
zones+side via a ``scripts/accept_cs2_overpass_lineups.py`` (added at accept time).

Source: idempotently ensures a dedicated ``youtube_playlist`` source with the
fixed UUID ``f068ec87-3ec3-4658-a753-e07acf01894c`` (matched by
``config_json->>'url'``); its ``config_json`` carries ``map_hint=overpass`` +
``game_hint=cs2`` (the single-map hard-lock the classifier scoping uses, #782).
NO agent_hint (that is Valorant/Sova-only).

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend:
  .venv/Scripts/python.exe scripts/create_cs2_overpass_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_cs2_overpass_lineups.py
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

YOUTUBE_VIDEO_ID = "hGc4PNhGRQ0"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "NartOutHere"
GAME_SLUG = "cs2"
MAP_SLUG = "overpass"
SOURCE_UUID = "f068ec87-3ec3-4658-a753-e07acf01894c"

# (chapter_start_seconds, name, utility_slug) — verbatim native chapter titles.
# chapter_start_seconds IS each lineup's clip-storage identity AND drives
# recut_lineup_clips.py's contiguous chapter_end (= next row's start). The 71
# starts are contiguous; the LAST row (911) has no next row, so pass
# `recut --chapter-end 919` (ceil of the 919.0s duration).
# MIX of utility (29 smoke / 20 molotov / 20 flash / 2 grenade). Utility per the
# LEADING utility named in each native title (combos/groups keyed to primary).
LINEUPS: list[tuple[int, str, str]] = [
    (42,  "Toliet Smoke",                                    "smoke"),    # ce=49
    (49,  "Bathroom Smoke",                                  "smoke"),    # ce=57
    (57,  "Mid Control Nades",                               "smoke"),    # ce=67   GROUPED
    (67,  "Toliet Smoke & Divider Molotov",                  "smoke"),    # ce=79   COMBO smoke+molotov
    (79,  "Overpass Mid Nades Near T Spawn",                 "smoke"),    # ce=98   GROUPED
    (98,  "Party Molotov",                                   "molotov"),  # ce=109
    (109, "Overpass Party Molotov",                          "molotov"),  # ce=115
    (115, "Fountain Flash",                                  "flash"),    # ce=125
    (125, "Mid Flashes",                                     "flash"),    # ce=145  GROUPED (plural)
    (145, "Toliet Flash",                                    "flash"),    # ce=153
    (153, "Bathroom Flash",                                  "flash"),    # ce=165
    (165, "Connector Smoke",                                 "smoke"),    # ce=172
    (172, "Overpass Door Smoke",                             "smoke"),    # ce=184
    (184, "Connector Molotovs",                              "molotov"),  # ce=210  GROUPED (plural)
    (210, "Long A Flashes",                                  "flash"),    # ce=223  GROUPED
    (223, "Long A Toliet Flash",                             "flash"),    # ce=234
    (234, "Top Banana Smoke",                                "smoke"),    # ce=243
    (243, "A Lurk Smoke",                                    "smoke"),    # ce=251
    (251, "A Stairs Smoke & Banana Flashes",                 "smoke"),    # ce=269  COMBO smoke+flash
    (269, "Jumpup Smoke, Truck Molotov, A Flash",            "smoke"),    # ce=283  COMBO (3 utils)
    (283, "Dumpster Smoke, Truck Molotov, A Flashes",        "smoke"),    # ce=295  COMBO (3 utils)
    (295, "Bank Smoke, Banana Flash, Truck Molotov",         "smoke"),    # ce=313  COMBO (3 utils)
    (313, "Overpass Bank Smoke, Truck Molotov",              "smoke"),    # ce=326  COMBO smoke+molotov
    (326, "Overpass Truck Molotov",                          "molotov"),  # ce=335
    (335, "Dice Molotov",                                    "molotov"),  # ce=340  short (5s)
    (340, "A Stairs Molotov",                                "molotov"),  # ce=345  short (5s)
    (345, "A Execute Nades From Long A",                     "smoke"),    # ce=369  GROUPED EXECUTE
    (369, "Short Molotov, Boost Nade",                       "molotov"),  # ce=381  COMBO (primary molotov)
    (381, "Shortpipe Smoke",                                 "smoke"),    # ce=389
    (389, "Short Pipe Smoke",                                "smoke"),    # ce=397
    (397, "Water Control Nades",                             "smoke"),    # ce=407  GROUPED
    (407, "Water Flashes",                                   "flash"),    # ce=421  GROUPED
    (421, "Short Flashes",                                   "flash"),    # ce=432  GROUPED
    (432, "Boost Molotov",                                   "molotov"),  # ce=442
    (442, "Train Track Molotov",                             "molotov"),  # ce=448  short (6s)
    (448, "Pillar Molotovs",                                 "molotov"),  # ce=463  GROUPED (plural)
    (463, "Monster Flashes",                                 "flash"),    # ce=495  GROUPED
    (495, "Overpass B Flashes",                              "flash"),    # ce=520  GROUPED
    (520, "B Flashes & Heaven Smoke From Short",             "flash"),    # ce=536  COMBO (leading flash)
    (536, "Overpass Heaven Smoke",                           "smoke"),    # ce=550
    (550, "Overpass B Nades",                                "smoke"),    # ce=568  GROUPED
    (568, "Bridge Smoke",                                    "smoke"),    # ce=576
    (576, "ABC Smoke",                                       "smoke"),    # ce=588
    (588, "Monster Lurk Smoke",                              "smoke"),    # ce=598
    (598, "Barrel Molotov",                                  "molotov"),  # ce=619
    (619, "Woodwall Molotov",                                "molotov"),  # ce=628
    (628, "Pit Ramp Molotov",                                "molotov"),  # ce=636
    (636, "ABC Molotov",                                     "molotov"),  # ce=647
    (647, "CT Molotov",                                      "molotov"),  # ce=653  short (6s)
    (653, "Pit Molotov",                                     "molotov"),  # ce=658  short (5s)
    (658, "Woodwall HE Nade",                                "grenade"),  # ce=670  HE (confirm detonation)
    (670, "Monster Smoke",                                   "smoke"),    # ce=678
    (678, "New Monster Smoke",                               "smoke"),    # ce=687
    (687, "Monster Smoke & Shortpipe Molotov From Banana",   "smoke"),    # ce=703  COMBO smoke+molotov
    (703, "Shortpipe Molotov & Door Nade",                   "molotov"),  # ce=728  COMBO (primary molotov)
    (728, "Shortpipe HE Nade",                               "grenade"),  # ce=733  HE (confirm detonation)
    (733, "Water Flash",                                     "flash"),    # ce=743
    (743, "Shortpipe Flash",                                 "flash"),    # ce=753
    (753, "Short Flash",                                     "flash"),    # ce=763
    (763, "Water Flashes",                                   "flash"),    # ce=788  GROUPED
    (788, "Connector Flashes",                               "flash"),    # ce=810  GROUPED
    (810, "Monster Flash",                                   "flash"),    # ce=820
    (820, "Cubby Nades",                                     "smoke"),    # ce=839  GROUPED (title-guess primary)
    (839, "Cubby Molotov",                                   "molotov"),  # ce=846
    (846, "T Stairs Smoke & Playground Molotov",            "smoke"),    # ce=855  COMBO smoke+molotov
    (855, "T Stairs Molotov",                                "molotov"),  # ce=871
    (871, "Fountain Flash",                                  "flash"),    # ce=890
    (890, "Playground Flash",                                "flash"),    # ce=899
    (899, "T Stairs Nade",                                   "smoke"),    # ce=905  TITLE-GUESS (bare "Nade")
    (905, "Monster Molotov",                                 "molotov"),  # ce=911
    (911, "Outside Monster Flash",                           "flash"),    # ce=919 (LAST → --chapter-end 919; video 919.0s)
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

        print("== create_cs2_overpass_lineups ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  utility ids= {util_id}")
        print(f"  source_id  = {source_id if source_id is not None else f'(would CREATE {SOURCE_UUID} map_hint=overpass)'}")
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
