"""Re-cut all 4 storyboard clips (STAND / AIM / THROW / LANDING) for ONE lineup
from OPERATOR-CONFIRMED frame-study spans — a DB/MinIO data-fix, NO pipeline,
NO Claude, NO localizer.

Initiative 7 (MGA lineup-localization accuracy sweep). The spans are the
operator's frame-study determinations (see auto-memory
feedback_mga_localize_by_frame_study); this script just realizes them as clips.

Mirrors each pane generator's store block EXACTLY so the result is
indistinguishable from a fresh pipeline cut at those instants:

  - THROW   : cut tight [s,e] -> overwrite ``{cs}-clip.mp4``; cut+upload the
              wide source ``{cs}-clip-source.mp4`` ([cs-7.5, ce+7.5]); persist
              clip_url + clip_url_original + trim offsets via set_clip_url.
  - LANDING : same shape against the ``-landing`` / ``-landing-source`` keys.
  - STAND   : cut tight [s,e] -> overwrite ``{cs}-stand-micro.mp4``; persist
              stand_clip_url + stand_clip_offset_s (offset INTO the shared THROW
              wide source = clip_start - wide_source_start).
  - AIM     : same against ``{cs}-aim-micro.mp4`` / aim_clip_offset_s.

Trim/offset math is the pipeline's own (``tight_offsets_within_source`` and
``clip_start - wide_source_start``) so the pane trim/shift editors open exactly
on the served clip. chapter_end is derived from the NEXT chapter's start (the
chapters are contiguous); the last chapter falls back to cs+120 (ffmpeg
truncates a long wide source at the real video end — harmless).

Idempotent: every key is deterministic per (video, chapter_start) and overwrites
in place. Does NOT touch stand_ts/aim_ts/anchor/screenshots (still fallbacks;
out of the clip-recut scope).

Run via the MAIN checkout venv, cwd = backend:
  python scripts/recut_lineup_clips.py 45d89ec3 \
    --stand 28.4 30.0 --aim 38.0 39.4 --throw 38.7 40.2 --landing 72.3 74.3
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text  # noqa: E402
from app.core.storage import get_storage  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.repositories.game import lineup_repo  # noqa: E402
from app.services.ingestion.clip_generator import (  # noqa: E402
    pending_clip_key,
    pending_clip_source_key,
)
from app.services.ingestion.landing_clip_generator import (  # noqa: E402
    pending_landing_clip_key,
    pending_landing_clip_source_key,
)
from app.services.ingestion.micro_clip_generator import (  # noqa: E402
    pending_aim_clip_key,
    pending_stand_clip_key,
)
from app.services.ingestion.frame_extractor import cut_clip  # noqa: E402
from app.services.ingestion.wide_source import (  # noqa: E402
    cut_and_upload_wide_source,
    tight_offsets_within_source,
)

VIDEO_DIR = Path(os.environ["TEMP"]) / "mga-debug-source"


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("id8", help="lineup id8 prefix (e.g. 45d89ec3)")
    for pane in ("stand", "aim", "throw", "landing"):
        p.add_argument(
            f"--{pane}", nargs=2, type=float, metavar=("START", "END"),
            required=True, help=f"{pane.upper()} span [start end] in source seconds",
        )
    p.add_argument(
        "--dry-run", action="store_true",
        help="print the plan + computed offsets, write nothing",
    )
    p.add_argument(
        "--chapter-end", type=float, default=None,
        help="override derived chapter_end (last-chapter case: bounds the "
             "shared wide source; does NOT affect the tight served clips)",
    )
    return p.parse_args()


async def _cut_and_upload_tight(storage, video: Path, key: str,
                                start: float, end: float) -> int:
    """Cut [start,end] from *video*, overwrite *key* in MinIO. Returns bytes."""
    clip_bytes = await cut_clip(video, start, end - start)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None, storage.upload_file, key, clip_bytes, "video/mp4"
    )
    return len(clip_bytes)


async def main() -> None:
    args = _parse_args()
    spans = {
        "stand": tuple(args.stand), "aim": tuple(args.aim),
        "throw": tuple(args.throw), "landing": tuple(args.landing),
    }
    for pane, (s, e) in spans.items():
        if e <= s:
            raise SystemExit(f"{pane}: end {e} must be > start {s}")

    async with AsyncSessionLocal() as db:
        lid = (await db.execute(text(
            "SELECT id FROM lineup WHERE substr(id::text,1,8)=:p"
        ), {"p": args.id8})).scalar_one_or_none()
        if lid is None:
            raise SystemExit(f"lineup id8={args.id8} not found")
        lineup = (await db.execute(
            select(Lineup).where(Lineup.id == lid)
        )).scalar_one()
        vid = lineup.youtube_video_id
        cs = float(lineup.chapter_start_seconds)

        # chapter_end = next contiguous chapter's start (same video); else cs+120.
        next_cs = (await db.execute(
            select(Lineup.chapter_start_seconds)
            .where(Lineup.youtube_video_id == vid,
                   Lineup.chapter_start_seconds > cs)
            .order_by(Lineup.chapter_start_seconds.asc())
            .limit(1)
        )).scalar_one_or_none()
        if args.chapter_end is not None:
            ce = float(args.chapter_end)
        else:
            ce = float(next_cs) if next_cs is not None else cs + 120.0

        print(f"== {str(lid)[:8]} {lineup.title!r} ==")
        print(f"  vid={vid} chapter=[{cs:.2f}, {ce:.2f}] (next_cs={next_cs}) "
              f"technique={lineup.technique!r}")
        print(f"  spans: stand={spans['stand']} aim={spans['aim']} "
              f"throw={spans['throw']} landing={spans['landing']}")
        print("  BEFORE:")
        print(f"    stand_clip={lineup.stand_clip_url} off={lineup.stand_clip_offset_s}")
        print(f"    aim_clip  ={lineup.aim_clip_url} off={lineup.aim_clip_offset_s}")
        print(f"    throw_clip={lineup.clip_url} orig={lineup.clip_url_original} "
              f"trim=[{lineup.clip_trim_start_s},{lineup.clip_trim_end_s}]")
        print(f"    landing   ={lineup.landing_clip_url} orig={lineup.landing_clip_url_original} "
              f"trim=[{lineup.landing_clip_trim_start_s},{lineup.landing_clip_trim_end_s}]")

        video = VIDEO_DIR / f"{vid}.mp4"
        if not video.exists():
            raise SystemExit(f"cached video missing: {video}")
        storage = get_storage()

        if args.dry_run:
            print("  [dry-run] no writes")
            return

        # ---- THROW wide source (also the SHARED source the micro panes index)
        throw_wide = await cut_and_upload_wide_source(
            local_video=video, video_id=vid, chapter_start=cs, chapter_end=ce,
            source_key=pending_clip_source_key(vid, cs),
            log_prefix="recut_throw", lineup_id=lineup.id,
        )
        if not throw_wide.succeeded:
            raise SystemExit(f"THROW wide source failed: {throw_wide.error_codes}")
        wide_start = throw_wide.source_start_s
        print(f"  THROW wide -> {throw_wide.source_key} start={wide_start:.2f} "
              f"dur={throw_wide.source_duration_s:.2f}")

        # ---- LANDING wide source (own key, same bounds/bytes)
        land_wide = await cut_and_upload_wide_source(
            local_video=video, video_id=vid, chapter_start=cs, chapter_end=ce,
            source_key=pending_landing_clip_source_key(vid, cs),
            log_prefix="recut_landing", lineup_id=lineup.id,
        )
        if not land_wide.succeeded:
            raise SystemExit(f"LANDING wide source failed: {land_wide.error_codes}")

        # ---- THROW tight + persist (clip_url + original + trim) -------------
        ts0, ts1 = spans["throw"]
        n = await _cut_and_upload_tight(storage, video, pending_clip_key(vid, cs), ts0, ts1)
        tr_s, tr_e = tight_offsets_within_source(
            tight_start=ts0, tight_duration=ts1 - ts0, source_start=wide_start)
        await lineup_repo.set_clip_url(
            db, lineup, pending_clip_key(vid, cs),
            source_key=throw_wide.source_key, trim_start_s=tr_s, trim_end_s=tr_e)
        print(f"  THROW   tight=[{ts0:.2f},{ts1:.2f}] ({n}B) trim=[{tr_s:.2f},{tr_e:.2f}]")

        # ---- LANDING tight + persist ----------------------------------------
        ls0, ls1 = spans["landing"]
        n = await _cut_and_upload_tight(storage, video, pending_landing_clip_key(vid, cs), ls0, ls1)
        lr_s, lr_e = tight_offsets_within_source(
            tight_start=ls0, tight_duration=ls1 - ls0, source_start=wide_start)
        await lineup_repo.set_landing_clip_url(
            db, lineup, pending_landing_clip_key(vid, cs),
            source_key=land_wide.source_key, trim_start_s=lr_s, trim_end_s=lr_e)
        print(f"  LANDING tight=[{ls0:.2f},{ls1:.2f}] ({n}B) trim=[{lr_s:.2f},{lr_e:.2f}]")

        # ---- STAND micro + persist (offset into the THROW wide source) ------
        ss0, ss1 = spans["stand"]
        n = await _cut_and_upload_tight(storage, video, pending_stand_clip_key(vid, cs), ss0, ss1)
        stand_off = ss0 - wide_start
        await lineup_repo.set_stand_clip_url(
            db, lineup, pending_stand_clip_key(vid, cs), offset_s=stand_off)
        print(f"  STAND   tight=[{ss0:.2f},{ss1:.2f}] ({n}B) offset_s={stand_off:.2f}")

        # ---- AIM micro + persist --------------------------------------------
        as0, as1 = spans["aim"]
        n = await _cut_and_upload_tight(storage, video, pending_aim_clip_key(vid, cs), as0, as1)
        aim_off = as0 - wide_start
        await lineup_repo.set_aim_clip_url(
            db, lineup, pending_aim_clip_key(vid, cs), offset_s=aim_off)
        print(f"  AIM     tight=[{as0:.2f},{as1:.2f}] ({n}B) offset_s={aim_off:.2f}")

        await db.refresh(lineup)
        print("  AFTER:")
        print(f"    stand_clip={lineup.stand_clip_url} off={lineup.stand_clip_offset_s}")
        print(f"    aim_clip  ={lineup.aim_clip_url} off={lineup.aim_clip_offset_s}")
        print(f"    throw_clip={lineup.clip_url} orig={lineup.clip_url_original} "
              f"trim=[{lineup.clip_trim_start_s:.2f},{lineup.clip_trim_end_s:.2f}]")
        print(f"    landing   ={lineup.landing_clip_url} orig={lineup.landing_clip_url_original} "
              f"trim=[{lineup.landing_clip_trim_start_s:.2f},{lineup.landing_clip_trim_end_s:.2f}]")
        print("DONE — 4 clips re-cut from operator-confirmed spans.")


asyncio.run(main())
