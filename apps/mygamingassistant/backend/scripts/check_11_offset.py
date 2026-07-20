"""Print #11 Stairs's stand_clip_offset_s + computed clip window for visual sanity."""
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
        row = (
            await s.execute(
                text(
                    """
                    SELECT stand_ts, stand_clip_offset_s, stand_localized_at,
                           stand_clip_url, chapter_start_seconds
                    FROM lineup WHERE id = :id
                    """
                ),
                {"id": LINEUP_ID},
            )
        ).first()
        d = dict(row._mapping)
        ch_start = d["chapter_start_seconds"]
        stand_ts = d["stand_ts"]
        offset = d["stand_clip_offset_s"]
        print(f"chapter_start_seconds = {ch_start}")
        print(f"stand_ts (absolute)   = {stand_ts}")
        print(f"stand_ts (rel to ch)  = {stand_ts - ch_start:.2f}s")
        print(f"stand_clip_offset_s   = {offset}")
        print(f"stand_localized_at    = {d['stand_localized_at']}")
        print(f"clip_url              = {d['stand_clip_url']}")
        print()
        if offset is not None:
            # New PR #778 end-anchored: window is [stand_ts - 3.0s, stand_ts]
            # offset_s is "where within the clip stand_ts lies"
            # End-anchored should produce offset_s ≈ 3.0 (stand_ts is at the END)
            # Old centered: offset_s would be near 1.0 (stand_ts in middle of 2s clip)
            print(f"Interpretation:")
            print(f"  offset≈3.0 => END-anchored (PR #778 NEW prompt working — walk-up shown)")
            print(f"  offset≈1.0 => CENTER-anchored (OLD PR #773 prompt — would mean #778 didn't take effect)")
            if abs(offset - 3.0) < 0.5:
                print(f"  >>> END-ANCHORED ({offset:.2f}s) — new prompt active <<<")
            elif abs(offset - 1.0) < 0.5:
                print(f"  >>> CENTER-anchored ({offset:.2f}s) — old behavior still showing <<<")
            else:
                print(f"  >>> UNEXPECTED ({offset:.2f}s) — investigate <<<")


asyncio.run(main())
