"""Read-only dump of all lineups — ground-truth before any backfill mutation.

Prints one row per lineup: short id, status, game/map slugs, presence flags for
clip columns (stand/aim micro, throw clip, landing clip), cached ts values, and
chapter metadata. No writes.
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.models.game.game import Game  # noqa: E402
from app.models.game.map import Map  # noqa: E402


def _b(v) -> str:
    return "Y" if v else "-"


async def main() -> None:
    async with AsyncSessionLocal() as s:
        rows = (
            await s.execute(
                select(Lineup, Game.slug, Map.slug)
                .outerjoin(Game, Game.id == Lineup.game_id)
                .outerjoin(Map, Map.id == Lineup.map_id)
                .order_by(Lineup.status, Lineup.title)
            )
        ).all()

        print(f"{'id8':8} {'status':14} {'game':6} {'map':10} "
              f"{'st':2} {'ai':2} {'cl':2} {'la':2} "
              f"{'stand_ts':>9} {'aim_ts':>8} {'vid':12} {'ch':>5}  title / chapter")
        print("-" * 130)
        n_acc = 0
        for lineup, game_slug, map_slug in rows:
            if lineup.status == "accepted":
                n_acc += 1
            print(
                f"{str(lineup.id)[:8]:8} {lineup.status:14} "
                f"{(game_slug or '-'):6} {(map_slug or '-'):10} "
                f"{_b(lineup.stand_clip_url):2} {_b(lineup.aim_clip_url):2} "
                f"{_b(lineup.clip_url):2} {_b(lineup.landing_clip_url):2} "
                f"{(f'{lineup.stand_ts:.2f}' if lineup.stand_ts else '-'):>9} "
                f"{(f'{lineup.aim_ts:.2f}' if lineup.aim_ts else '-'):>8} "
                f"{(lineup.youtube_video_id or '-'):12} "
                f"{(lineup.chapter_start_seconds if lineup.chapter_start_seconds is not None else '-'):>5}  "
                f"{lineup.title!r}"
            )
            if lineup.chapter_title and lineup.chapter_title != lineup.title:
                print(f"{'':70}      chapter: {lineup.chapter_title!r}")
        print("-" * 130)
        print(f"total={len(rows)}  accepted={n_acc}")
        print("legend: st=stand_clip ai=aim_clip cl=throw_clip la=landing_clip "
              "(Y=present, -=NULL)")


asyncio.run(main())
