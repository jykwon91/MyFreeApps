"""NULL #11 Stairs stand_clip_url + related cols so backfill will regenerate."""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402

LINEUP_ID = "9b2ad4c9-bc94-45d7-88e7-9fb6e9834f4a"


async def main() -> None:
    async with AsyncSessionLocal() as s:
        result = await s.execute(
            text(
                """
                UPDATE lineup
                   SET stand_clip_url = NULL,
                       stand_clip_offset_s = NULL
                 WHERE id = :id
                RETURNING id, stand_clip_url, stand_clip_offset_s
                """
            ),
            {"id": LINEUP_ID},
        )
        row = result.first()
        await s.commit()
        print(f"NULLed: {dict(row._mapping) if row else 'no row'}")


asyncio.run(main())
