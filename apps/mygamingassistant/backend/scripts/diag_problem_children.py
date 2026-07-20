"""Read-only: full cached state for the 3 throw-localizer problem children.

Dumps every column relevant to the stand/aim/throw/landing pipeline so the
diagnosis is grounded in actual DB values (not reconstructed). No writes.
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402

PREFIXES = ["69704f4a", "8e151f60", "f88308e3"]  # Market Door, Mid Win Top Mid, Jungle

COLS = [
    "id", "title", "chapter_title", "chapter_start_seconds",
    "stand_ts", "stand_localized_at", "stand_clip_url", "stand_clip_offset_s",
    "aim_ts", "aim_localized_at", "aim_clip_url", "aim_clip_offset_s",
    "clip_url", "clip_url_original", "clip_trim_start_s", "clip_trim_end_s",
    "landing_clip_url", "landing_clip_trim_start_s", "landing_clip_trim_end_s",
    "youtube_video_id",
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # Also pull ALL chapter_start_seconds for the same video so we can
        # infer each child's chapter_end (= next chapter start) — the value
        # the orchestrator derives at runtime and that is NOT stored.
        for pfx in PREFIXES:
            row = (await db.execute(text(
                f"SELECT {', '.join(COLS)} FROM lineup WHERE id::text LIKE :p"
            ), {"p": f"{pfx}%"})).mappings().first()
            if row is None:
                print(f"\n=== {pfx}: NOT FOUND ===")
                continue
            vid = row["youtube_video_id"]
            cs = row["chapter_start_seconds"]
            print(f"\n=== {pfx}  {row['title']!r} ===")
            for c in COLS:
                if c in ("id", "title"):
                    continue
                print(f"  {c:26} = {row[c]}")
            # next chapter start on same video (the derived chapter_end)
            nxt = (await db.execute(text(
                "SELECT MIN(chapter_start_seconds) AS n FROM lineup "
                "WHERE youtube_video_id = :v AND chapter_start_seconds > :cs"
            ), {"v": vid, "cs": cs})).scalar()
            print(f"  --> derived chapter_end (next chapter start) = {nxt}")
            if nxt is not None:
                print(f"  --> chapter window = [{cs}, {nxt}]  len={nxt - cs}s")


asyncio.run(main())
