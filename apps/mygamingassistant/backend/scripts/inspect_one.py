"""Read-only full-row dump of ONE lineup by id8 prefix — ground truth before
any clip re-cut. No writes.

Usage (from backend cwd, main venv):
    python scripts/inspect_one.py 45d89ec3
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402

_FIELDS = [
    "title", "status", "youtube_video_id", "chapter_start_seconds",
    "chapter_title", "setup_seconds", "technique",
    "stand_ts", "aim_ts", "aim_anchor_x", "aim_anchor_y",
    "stand_clip_url", "stand_clip_offset_s",
    "aim_clip_url", "aim_clip_offset_s",
    "clip_url", "clip_url_original", "clip_trim_start_s", "clip_trim_end_s",
    "landing_clip_url", "landing_clip_url_original",
    "landing_clip_trim_start_s", "landing_clip_trim_end_s",
    "stand_screenshot_url", "aim_screenshot_url",
]


async def main() -> None:
    prefix = sys.argv[1] if len(sys.argv) > 1 else "45d89ec3"
    async with AsyncSessionLocal() as s:
        lid = (await s.execute(text(
            "SELECT id FROM lineup WHERE substr(id::text,1,8)=:p"
        ), {"p": prefix})).scalar_one_or_none()
        if lid is None:
            print(f"NOT FOUND: id8={prefix}")
            return
        lineup = await s.get(Lineup, lid)
        print(f"== lineup {lid} ==")
        for f in _FIELDS:
            print(f"{f:28} = {getattr(lineup, f)!r}")


asyncio.run(main())
