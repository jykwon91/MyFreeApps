"""Read-only: list accepted lineups with their utility + landing-clip presence.

Used to pick regression-check controls for the landing-pad change (Fix A,
_POST_RESULT_PRE_PAD 1.5 -> 0.0). We want a couple non-flagged SMOKE lineups
that currently HAVE a landing clip, to re-cut and confirm pad=0 doesn't
regress them. Scratch tool — not committed.
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402


async def main() -> None:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text(
            """
            SELECT l.id::text AS id, m.slug AS map, ut.slug AS util,
                   l.status,
                   (l.landing_clip_url IS NOT NULL) AS has_landing,
                   (l.clip_url IS NOT NULL) AS has_throw,
                   l.chapter_title
            FROM lineup l
            LEFT JOIN map m ON m.id = l.map_id
            LEFT JOIN utility_type ut ON ut.id = l.utility_type_id
            WHERE l.status = 'accepted'
            ORDER BY m.slug, ut.slug, l.chapter_title
            """
        ))).all()

    print(f"{'id8':10} {'map':8} {'util':9} {'land':5} {'throw':5} title")
    print("-" * 80)
    for r in rows:
        print(
            f"{r.id[:8]:10} {(r.map or '-'):8} {(r.util or '-'):9} "
            f"{('Y' if r.has_landing else '-'):5} "
            f"{('Y' if r.has_throw else '-'):5} {(r.chapter_title or '')[:40]}"
        )
    print(f"\n{len(rows)} accepted lineups")


asyncio.run(main())
