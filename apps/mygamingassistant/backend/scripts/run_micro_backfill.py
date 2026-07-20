"""Run backfill_micro_clips with INFO logging to stdout for visibility.

Identical work to `python -m app.cli backfill-micro-clips` but configures the
root logger so per-video / per-lineup progress is captured (the CLI entrypoint
doesn't call logging.basicConfig, so its logger.info lines go nowhere). Used to
resume the library-wide STAND regeneration after PG was externally
fast-shutdown mid-run. Idempotent: only lineups with a NULL stand/aim clip are
candidates, so already-regenerated rows are skipped.
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
# Quiet yt-dlp's byte-by-byte download spam; keep our ingestion logs.
logging.getLogger("yt_dlp").setLevel(logging.WARNING)

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.services.ingestion.micro_clip_backfill import backfill_micro_clips  # noqa: E402


async def main() -> None:
    async with AsyncSessionLocal() as db:
        stats = await backfill_micro_clips(db)
        print("==== SUMMARY ====", flush=True)
        print(stats.summary(), flush=True)
        for e in stats.errors:
            print("ERR:", e, flush=True)


asyncio.run(main())
