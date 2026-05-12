"""Load game taxonomy fixtures from JSON files into the database.

Called from:
  1. The Alembic data migration (creates seed data at migration time).
  2. CLI: ``python -m app.cli load-fixtures`` (re-runs idempotently).

Each fixture file is idempotent — it checks by ``slug`` before inserting
so running the loader multiple times never duplicates rows. This is safe to
run against a database that already has data.

Fixture files live at ``apps/mygamingassistant/backend/app/fixtures/``.
"""
import json
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.site import Site
from app.models.game.utility_type import UtilityType

logger = logging.getLogger(__name__)

_FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"


def _load_json(filename: str) -> list[dict]:
    path = _FIXTURES_DIR / filename
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


async def load_fixtures(db: AsyncSession) -> None:
    """Load all fixture data into the database. Idempotent.

    Order: games → utility_types → maps → zones + sites
    (each step depends on the previous one).
    """
    await _load_games(db)
    await _load_utility_types(db)
    await _load_maps(db, "valorant_maps.json")
    await _load_maps(db, "cs2_maps.json")
    logger.info("fixture_loader: all fixtures loaded")


async def _load_games(db: AsyncSession) -> None:
    games = _load_json("games.json")
    for g in games:
        existing = (await db.execute(select(Game).where(Game.slug == g["slug"]))).scalar_one_or_none()
        if existing is not None:
            continue
        db.add(Game(
            slug=g["slug"],
            name=g["name"],
            side_a_label=g["side_a_label"],
            side_b_label=g["side_b_label"],
        ))
        logger.debug("fixture_loader: inserted game %s", g["slug"])
    await db.flush()


async def _load_utility_types(db: AsyncSession) -> None:
    fixture = _load_json("utility_types.json")
    for entry in fixture:
        game = (await db.execute(select(Game).where(Game.slug == entry["game_slug"]))).scalar_one_or_none()
        if game is None:
            logger.warning("fixture_loader: game %s not found, skipping utility_types", entry["game_slug"])
            continue
        for ut in entry["utility_types"]:
            existing = (await db.execute(
                select(UtilityType).where(UtilityType.game_id == game.id, UtilityType.slug == ut["slug"])
            )).scalar_one_or_none()
            if existing is not None:
                continue
            db.add(UtilityType(game_id=game.id, slug=ut["slug"], name=ut["name"]))
            logger.debug("fixture_loader: inserted utility_type %s/%s", entry["game_slug"], ut["slug"])
    await db.flush()


async def _load_maps(db: AsyncSession, filename: str) -> None:
    fixture = _load_json(filename)
    for entry in fixture:
        game = (await db.execute(select(Game).where(Game.slug == entry["game_slug"]))).scalar_one_or_none()
        if game is None:
            logger.warning("fixture_loader: game %s not found, skipping %s", entry["game_slug"], filename)
            continue
        for m in entry["maps"]:
            existing_map = (await db.execute(
                select(Map).where(Map.game_id == game.id, Map.slug == m["slug"])
            )).scalar_one_or_none()
            if existing_map is None:
                existing_map = Map(
                    game_id=game.id,
                    slug=m["slug"],
                    name=m["name"],
                    minimap_url=m.get("minimap_url"),
                )
                db.add(existing_map)
                await db.flush()
                logger.debug("fixture_loader: inserted map %s/%s", entry["game_slug"], m["slug"])

            # Zones
            for z in m.get("zones", []):
                existing_zone = (await db.execute(
                    select(MapZone).where(MapZone.map_id == existing_map.id, MapZone.slug == z["slug"])
                )).scalar_one_or_none()
                if existing_zone is None:
                    db.add(MapZone(
                        map_id=existing_map.id,
                        slug=z["slug"],
                        name=z["name"],
                        polygon_points=z.get("polygon_points", []),
                    ))

            # Sites
            for s in m.get("sites", []):
                existing_site = (await db.execute(
                    select(Site).where(Site.map_id == existing_map.id, Site.slug == s["slug"])
                )).scalar_one_or_none()
                if existing_site is None:
                    db.add(Site(map_id=existing_map.id, slug=s["slug"], name=s["name"]))

        await db.flush()


async def load_fixtures_standalone() -> None:
    """Run the loader in its own session. Used by the CLI."""
    async with unit_of_work() as db:
        await load_fixtures(db)
