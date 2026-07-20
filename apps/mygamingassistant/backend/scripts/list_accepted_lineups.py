"""List ALL accepted lineups with the data needed to propose localization windows.

Read-only. Run via the main checkout's .venv python from the backend dir:
  .venv\\Scripts\\python.exe scripts\\list_accepted_lineups.py

Per-video, lineups are ordered by chapter_start so chapter_end can be inferred
as the next accepted lineup's start (a loose upper bound for the rough window;
the operator confirms/corrects the real window).
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402


def _f(x: object) -> str:
    if x is None:
        return "None"
    if isinstance(x, float):
        return f"{x:.3f}"
    return str(x)


async def main() -> None:
    async with AsyncSessionLocal() as s:
        rows = (
            await s.execute(
                text(
                    """
                    SELECT l.id, l.title, l.status, l.youtube_video_id,
                           l.chapter_start_seconds, l.chapter_title,
                           l.stand_ts, l.aim_ts, l.technique,
                           l.clip_url, l.landing_clip_url,
                           l.stand_clip_url, l.aim_clip_url,
                           l.clip_url_original,
                           l.clip_trim_start_s, l.clip_trim_end_s,
                           m.slug AS map_slug, m.name AS map_name
                    FROM lineup l
                    LEFT JOIN map m ON m.id = l.map_id
                    WHERE l.status = 'accepted'
                    ORDER BY l.youtube_video_id, l.chapter_start_seconds
                    """
                )
            )
        ).all()

    print(f"{len(rows)} accepted lineups total\n")

    by_video: dict[str, list] = {}
    for r in rows:
        by_video.setdefault(r.youtube_video_id, []).append(r)

    for vid, lst in by_video.items():
        print(f"=== video {vid} ({len(lst)} accepted) ===")
        for i, r in enumerate(lst):
            d = dict(r._mapping)
            nxt = lst[i + 1].chapter_start_seconds if i + 1 < len(lst) else None
            clips = "  ".join(
                f"{lbl}={'Y' if d[col] else '-'}"
                for col, lbl in (
                    ("stand_clip_url", "STAND"),
                    ("aim_clip_url", "AIM"),
                    ("clip_url", "THROW"),
                    ("landing_clip_url", "LANDING"),
                )
            )
            print(f"  [{i + 1}] {d['title']!r}  map={d['map_slug']}  id={str(d['id'])[:8]}")
            print(
                f"       chapter={d['chapter_title']!r}  "
                f"start={d['chapter_start_seconds']}  next_chapter_start={nxt}"
            )
            print(
                f"       stand_ts={_f(d['stand_ts'])}  aim_ts={_f(d['aim_ts'])}  "
                f"technique={d['technique']!r}"
            )
            print(f"       clips: {clips}")
            print(
                f"       throw_trim: start={_f(d['clip_trim_start_s'])} "
                f"end={_f(d['clip_trim_end_s'])}  "
                f"clip_orig={'Y' if d['clip_url_original'] else '-'}"
            )
        print()


asyncio.run(main())
