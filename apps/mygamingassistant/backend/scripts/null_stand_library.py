"""Library-wide STAND reset to force #778 (arrival-instant) re-localization.

NULLs the four STAND columns (stand_clip_url, stand_clip_offset_s, stand_ts,
stand_localized_at) for every ACCEPTED lineup EXCEPT #11 Stairs (9b2ad4c9) —
#11 was already regenerated under #778 and operator-confirmed good, so we keep
it as the reference and don't re-roll the localizer on it.

After this, `python -m app.cli backfill-micro-clips` re-runs the STAND localizer
under the #778 prompt for the reset lineups. AIM columns are deliberately left
intact (aim_ts cached) so AIM is a byte-identical re-cut, not a re-localize.

Mirrors scripts/null_11_stand_full.py, scoped to the library minus #11.
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402

KEEP_ID = "9b2ad4c9-bc94-45d7-88e7-9fb6e9834f4a"  # #11 Stairs — already #778


async def main() -> None:
    async with AsyncSessionLocal() as s:
        result = await s.execute(
            text(
                """
                UPDATE lineup
                   SET stand_clip_url = NULL,
                       stand_clip_offset_s = NULL,
                       stand_ts = NULL,
                       stand_localized_at = NULL
                 WHERE status = 'accepted'
                   AND id <> :keep
                RETURNING id, title
                """
            ),
            {"keep": KEEP_ID},
        )
        rows = result.all()
        await s.commit()
        print(f"NULLed STAND columns for {len(rows)} lineup(s) "
              f"(excluding #11 Stairs):")
        for r in rows:
            print(f"  {str(r.id)[:8]}  {r.title!r}")


asyncio.run(main())
