"""Read-only: utility type + technique for all accepted lineups (video order)."""
import asyncio
import sys
from collections import Counter
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
                    "SELECT l.chapter_start_seconds AS cs, l.title, "
                    "ut.name AS uname, ut.slug AS uslug, l.technique "
                    "FROM lineup l "
                    "LEFT JOIN utility_type ut ON ut.id = l.utility_type_id "
                    "WHERE l.status = 'accepted' "
                    "ORDER BY l.chapter_start_seconds"
                )
            )
        ).all()
    c: Counter = Counter()
    for r in rows:
        c[r.uslug] += 1
        print(f"  {r.title:32s} util={r.uname} ({r.uslug})  tech={r.technique}")
    print("\nMIX:", dict(c))


asyncio.run(main())
