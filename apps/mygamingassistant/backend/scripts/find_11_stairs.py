"""Find lineups whose title mentions 'stair' or '#11'; print clip URLs + timestamps."""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402


async def main() -> None:
    async with AsyncSessionLocal() as s:
        rows = (
            await s.execute(
                text(
                    """
                    SELECT id, title, stand_clip_url, stand_ts, aim_ts,
                           clip_url, landing_clip_url, chapter_title, chapter_start_seconds
                    FROM lineup
                    WHERE title ILIKE '%stair%' OR title ILIKE '%#11%'
                       OR chapter_title ILIKE '%stair%' OR chapter_title ILIKE '%#11%'
                    ORDER BY created_at DESC
                    LIMIT 10
                    """
                )
            )
        ).all()
        for r in rows:
            d = dict(r._mapping)
            print(f"  id={d['id']}  title={d['title']!r}  chapter={d['chapter_title']!r} ch_start={d['chapter_start_seconds']}")
            print(f"    stand_ts={d['stand_ts']}  aim_ts={d['aim_ts']}")
            print(f"    stand_clip={d['stand_clip_url']}")
            print(f"    throw_clip={d['clip_url']}")
            print(f"    landing_clip={d['landing_clip_url']}")
            print()


asyncio.run(main())
