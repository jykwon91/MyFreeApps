"""Read-only dump of the full 9b2ad4c9 'Stairs - A Site' row — ground truth
before any throw-clip re-cut. No writes."""
import asyncio
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402

LID = uuid.UUID("9b2ad4c9-bc94-45d7-88e7-9fb6e9834f4a")

_FIELDS = [
    "title", "status", "youtube_video_id", "chapter_start_seconds",
    "chapter_title", "setup_seconds", "technique",
    "stand_ts", "aim_ts", "aim_anchor_x", "aim_anchor_y",
    "clip_url", "clip_url_original", "clip_trim_start_s", "clip_trim_end_s",
    "landing_clip_url", "landing_clip_url_original",
    "stand_clip_url", "stand_clip_offset_s",
    "aim_clip_url", "aim_clip_offset_s",
]


async def main() -> None:
    async with AsyncSessionLocal() as s:
        lineup = await s.get(Lineup, LID)
        if lineup is None:
            print("NOT FOUND")
            return
        for f in _FIELDS:
            print(f"{f:26} = {getattr(lineup, f)!r}")


asyncio.run(main())
