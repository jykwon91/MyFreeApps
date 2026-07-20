"""Read-only: dump everything needed to auto-accept the Anubis lineups.

- Anubis map id + its map_zones (slug -> id)
- CS2 utility types (slug -> id)
- The 15 et6AZ5a5k3I lineups: do they already have game_id/map_id/utility_type_id?
  what side/zones (should be NULL pre-accept)?
- The accepted Mirage lineups as a CALIBRATION reference for side + zone usage.
No writes.
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.models.game.map import Map  # noqa: E402
from app.models.game.map_zone import MapZone  # noqa: E402
from app.models.game.utility_type import UtilityType  # noqa: E402


async def main() -> None:
    async with AsyncSessionLocal() as s:
        zmap = {z.id: z.slug for z in (await s.execute(select(MapZone))).scalars().all()}
        umap = {u.id: u.slug for u in (await s.execute(select(UtilityType))).scalars().all()}

        anubis = (await s.execute(select(Map).where(Map.slug == "anubis"))).scalar_one_or_none()
        print(f"anubis map id = {anubis.id if anubis else None}")
        print("\nANUBIS ZONES (slug -> id):")
        zones = (await s.execute(
            select(MapZone).where(MapZone.map_id == anubis.id).order_by(MapZone.slug)
        )).scalars().all()
        for z in zones:
            print(f"  {z.slug:16} {z.name!r:24} {z.id}")

        print("\nCS2 UTILITY TYPES (slug -> id):")
        uts = (await s.execute(select(UtilityType).order_by(UtilityType.slug))).scalars().all()
        for u in uts:
            print(f"  {u.slug:16} {u.id}")

        print("\nThe 15 et6AZ5a5k3I lineups (pre-accept state):")
        rows = (await s.execute(
            select(Lineup).where(Lineup.youtube_video_id == "et6AZ5a5k3I")
            .order_by(Lineup.chapter_start_seconds)
        )).scalars().all()
        for l in rows:
            print(f"  {str(l.id)[:8]} cs={l.chapter_start_seconds:>4} "
                  f"game={'Y' if l.game_id else '-'} map={'Y' if l.map_id else '-'} "
                  f"util={umap.get(l.utility_type_id, '-'):8} side={l.side or '-':6} "
                  f"tz={zmap.get(l.target_zone_id, '-'):8} sz={zmap.get(l.stand_zone_id, '-'):8} "
                  f"status={l.status:14} {l.title!r}")

        print("\nACCEPTED lineups (CALIBRATION — side + zone conventions):")
        acc = (await s.execute(
            select(Lineup).where(Lineup.status == "accepted").order_by(Lineup.title)
        )).scalars().all()
        for l in acc:
            print(f"  {l.title!r:38} side={l.side or '-':7} "
                  f"stand={zmap.get(l.stand_zone_id, '-'):10} target={zmap.get(l.target_zone_id, '-'):10} "
                  f"util={umap.get(l.utility_type_id, '-')}")


asyncio.run(main())
