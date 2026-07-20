"""Hide the 'Best Anubis Smokes Guide' lineup — it's the video INTRO card, not
a lineup (both screenshot panes are the title-card overlay). Calls the real
repo soft-delete (status='hidden') so it's identical to the operator clicking
Hide in the UI.
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.repositories.game.lineup.lifecycle import hide_lineup  # noqa: E402

LINEUP_ID = "4ee6ccef-190f-4447-b3b2-dd592fff4b72"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        lineup = (
            await db.execute(select(Lineup).where(Lineup.id == LINEUP_ID))
        ).scalar_one()
        print(f"before: {lineup.title!r}  status={lineup.status}")
        await hide_lineup(db, lineup)
        print(f"after:  {lineup.title!r}  status={lineup.status}")


asyncio.run(main())
