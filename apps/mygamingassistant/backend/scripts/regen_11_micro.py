"""Regenerate ONLY #11 Stairs micro-clips.

Reuses the real backfill logic (download-once-per-video, throw-localizer +
stand/aim localizers, per-side commit) but scopes the candidate set to the
single #11 lineup so we don't re-download the other eligible videos.

#11's stand_ts + stand_localized_at were NULLed (scripts/null_11_stand_full.py)
so the STAND localizer RE-RUNS here under the new #778 arrival-anchor prompt.
AIM is untouched (its cached aim_ts is reused — re-cut only, no Claude).
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.services.ingestion import micro_clip_backfill  # noqa: E402

LINEUP_ID = "9b2ad4c9-bc94-45d7-88e7-9fb6e9834f4a"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        lineup = (
            await db.execute(select(Lineup).where(Lineup.id == LINEUP_ID))
        ).scalar_one()
        print(f"target: {lineup.title!r}  video_id={lineup.youtube_video_id}  "
              f"chapter_start={lineup.chapter_start_seconds}")

        async def _only_11(_db):
            return [lineup]

        # Scope the backfill to just #11.
        micro_clip_backfill.lineup_repo.list_accepted_lineups_needing_micro_clips = _only_11

        stats = await micro_clip_backfill.backfill_micro_clips(db)
        print("---- summary ----")
        print(stats.summary())
        for e in stats.errors:
            print("ERR:", e)

        db.expire_all()
        row = (
            await db.execute(
                select(Lineup.stand_ts, Lineup.stand_clip_url, Lineup.aim_ts)
                .where(Lineup.id == LINEUP_ID)
            )
        ).first()
        print("---- result ----")
        print(f"stand_ts       = {row.stand_ts}")
        print(f"aim_ts         = {row.aim_ts}")
        print(f"stand_clip_url = {row.stand_clip_url}")


asyncio.run(main())
