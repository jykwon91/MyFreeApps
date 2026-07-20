"""Create Viper/Icebox lineups for B3ast's guide video (v8v1QGPSSg4,
"Top 15 New Icebox Viper Post Plant Lineups") as a DIRECT DB write that
BYPASSES the classifier-coupled ingestion orchestrator.

Same shape as ``create_sova_icebox_lineups.py`` — FIRST Viper ingest. Unlike the
Sova sources, B3ast videos have NO chapters, NO on-screen names, and NO
description timestamps (verified via dump_chapters.py / yt-dlp: chapters=0). So
the (chapter_start_seconds, name) values here are NOT native chapter data — they
are derived from a scene-cut scan + frame-study localization, and every name +
its target/stand callout is INFERRED from the minimap + landing payload (per the
operator-approved "B3ast + inferred zones" plan). The operator's full-res eyeball
on :5176 is the naming/zoning gate.

PROOF BATCH (4 of ~15): four scene-cut-bounded windows localized by parallel
subagents (LOCALIZE_INSTRUCTIONS_VIPER.md) to validate that this chapterless,
nameless source yields accurate localized+zoned lineups before the full 15
Icebox set + the other 8 maps are built. Spans + inferred stand/target/side live
in ``scripts/viper_icebox_spans.md`` for the future accept step.

  cs   stand         target             ability     technique
  50   A Belt        A Default (plant)  snake-bite  standing
  92   A Nest        A Default (plant)  snake-bite  standing
  107  A Screen      A Default (plant)  snake-bite  standing
  194  B Green       B Yellow (spike)   snake-bite  standing

All snake-bite (Snake Bite Snakebite molly). ``snake-bite`` MUST exist in
utility_type or this ABORTS fail-loud — re-run ``python -m app.cli load-fixtures``.

What this script does NOT do (per feedback_mga_localize_by_frame_study):
  - No screenshots / clips / wide sources / MinIO writes.
  - No zones / side — ACCEPTANCE-time fields, NULL-exempt on pending rows.
Clips come next via ``scripts/recut_lineup_clips.py <id8> --stand .. --aim ..
--throw .. --landing ..`` (spans from ``viper_icebox_spans.md``); zones+side via
a future ``accept_viper_icebox_lineups.py`` once the operator OKs the eyeball.

Idempotent: a lineup is created only if no row exists with the same
``youtube_video_id`` + ``chapter_start_seconds``. Re-running never duplicates.

Run via the MAIN checkout venv, cwd = backend (PG:5433 must be UP):
  .venv/Scripts/python.exe scripts/create_viper_icebox_lineups.py --dry-run
  .venv/Scripts/python.exe scripts/create_viper_icebox_lineups.py
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

YOUTUBE_VIDEO_ID = "v8v1QGPSSg4"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "B3ast plays YT"
GAME_SLUG = "valorant"
MAP_SLUG = "icebox"
AGENT_HINT = "viper"

# (chapter_start_seconds, name, utility_slug). cs = the localized STAND start
# (unique per lineup; NOT native chapter data — this source has none). Names are
# INFERRED target(from-stand) callouts; the operator's eyeball is the gate.
LINEUPS: list[tuple[int, str, str]] = [
    (50,  "A Default (from A Belt)",   "snake-bite"),
    (92,  "A Default (from A Nest)",   "snake-bite"),
    (107, "A Default (from A Screen)", "snake-bite"),
    (194, "B Yellow (from B Green)",   "snake-bite"),
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
            f"Available: {sorted(util_id)}. Run `python -m app.cli load-fixtures`.")
    return game_id, map_id, util_id


async def _ensure_source(db, *, dry_run: bool) -> str | None:
    existing_id = (await db.execute(
        text("SELECT id FROM source WHERE config_json->>'url' = :u"),
        {"u": VIDEO_URL})).scalar_one_or_none()
    if existing_id is not None:
        if not dry_run:
            source = await db.get(Source, existing_id)
            cfg = dict(source.config_json or {})
            if cfg.get("agent_hint") != AGENT_HINT:
                cfg["agent_hint"] = AGENT_HINT
                source.config_json = cfg
                await db.flush()
        return existing_id
    if dry_run:
        return None
    source = Source(
        kind="youtube_playlist",
        config_json={"url": VIDEO_URL, "map_hint": MAP_SLUG,
                     "game_hint": GAME_SLUG, "agent_hint": AGENT_HINT},
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

        print("== create_viper_icebox_lineups (PROOF batch: 4) ==")
        print(f"  video      = {YOUTUBE_VIDEO_ID}  ({VIDEO_URL})")
        print(f"  author     = {AUTHOR}")
        print(f"  map        = {MAP_SLUG}  id={map_id}   game={GAME_SLUG} id={game_id}")
        print(f"  source_id  = {source_id if source_id is not None else '(would CREATE map_hint=icebox agent_hint=viper)'}")
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
                print(f"    WOULD-CREATE cs={cs:<4} util={util_slug:<10} {name!r}")
                continue
            lineup = Lineup(**data)
            db.add(lineup)
            await db.flush()
            created_ids.append(str(lineup.id))
            print(f"    CREATE cs={cs:<4} util={util_slug:<10} id8={str(lineup.id)[:8]} {name!r}")

        if args.dry_run:
            print(f"\n[DRY-RUN] would create {len(LINEUPS) - skipped}, skip {skipped}. No writes.")
            return
        await db.commit()
        print(f"\nDONE — created {len(created_ids)}, skipped {skipped}. "
              f"new id8s: {[i[:8] for i in created_ids]}")


asyncio.run(main())
