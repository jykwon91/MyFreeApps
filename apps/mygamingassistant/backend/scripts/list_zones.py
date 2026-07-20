"""List MapZone slugs for a given map. Usage: python scripts/list_zones.py <map_slug>"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.map import Map  # noqa: E402
from app.models.game.map_zone import MapZone  # noqa: E402


async def main() -> None:
    map_slug = sys.argv[1]
    async with AsyncSessionLocal() as db:
        game_id = (await db.execute(text("SELECT id FROM game WHERE slug='valorant'"))).scalar_one()
        vmap = (await db.execute(select(Map).where(
            Map.slug == map_slug, Map.game_id == game_id))).scalar_one()
        zones = (await db.execute(select(MapZone).where(
            MapZone.map_id == vmap.id).order_by(MapZone.slug))).scalars().all()
        print(f"{map_slug}: {len(zones)} zones")
        for z in zones:
            print(f"  {z.slug:20} {z.name}")


asyncio.run(main())
