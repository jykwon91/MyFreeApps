"""Scoped micro-clip backfill — only the given lineup IDs.

Used to finish 89c4bfd9 (Ticket) + f88308e3 (Jungle): both localized cleanly
on the prior run (stand_ts/aim_ts cached + committed) but their MinIO upload
failed because :9000 was down. With MinIO back up, this re-cuts from the
cached timestamps (NO Claude re-localize) and uploads. Scopes the candidate
set so Market Door (69704f4a) + Mid-Window-Top-Mid (8e151f60) — the two
throw-localizer problem children — are left untouched for separate handling.
"""
import asyncio
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)
logging.getLogger("yt_dlp").setLevel(logging.WARNING)

from sqlalchemy import select  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.services.ingestion import micro_clip_backfill  # noqa: E402

TARGET_IDS = [
    "89c4bfd9-6ca0-4c7d-a27e-792fea7eaec4",  # Ticket/CT - A Site
    "f88308e3-bfc0-4855-a27e-4b823a8613eb",  # Jungle - A Site
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        lineups = (
            await db.execute(select(Lineup).where(Lineup.id.in_(TARGET_IDS)))
        ).scalars().all()
        print(f"targeting {len(lineups)} lineup(s):", flush=True)
        for lu in lineups:
            print(f"  {str(lu.id)[:8]} {lu.title!r} "
                  f"stand_ts={lu.stand_ts} aim_ts={lu.aim_ts}", flush=True)

        async def _scoped(_db):
            return list(lineups)

        micro_clip_backfill.lineup_repo.list_accepted_lineups_needing_micro_clips = _scoped

        stats = await micro_clip_backfill.backfill_micro_clips(db)
        print("==== SUMMARY ====", flush=True)
        print(stats.summary(), flush=True)
        for e in stats.errors:
            print("ERR:", e, flush=True)


asyncio.run(main())
