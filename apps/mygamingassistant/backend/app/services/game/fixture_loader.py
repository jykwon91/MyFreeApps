"""Load game taxonomy fixtures from JSON files into the database.

Called from:
  1. CLI: ``python -m app.cli load-fixtures`` (runs idempotently).

Each fixture file is idempotent — the repository layer checks by ``slug``
before inserting so running the loader multiple times never duplicates rows.

Fixture files live at ``apps/mygamingassistant/backend/app/fixtures/``.
"""
import json
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.repositories.game import game_repo

logger = logging.getLogger(__name__)

_FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"


def _load_json(filename: str) -> list[dict]:
    path = _FIXTURES_DIR / filename
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


# Map fixture files that are seeded by ``load_fixtures``. A file may only
# appear here once EVERY zone in it has a non-empty ``polygon_points`` — a
# zone with no polygon yields no centroid, so its lineups are unplaceable on
# the minimap (the honest "position unknown" path) and the operator sees a
# permanent calibration notice. Seeding empty-polygon zones ships broken
# content on a clean deploy. ``valorant_maps.json`` now ships approximate
# seed polygons for all 69 zones (centroid-correct, derived from official
# valorant-api.com callout coords; operators refine edges via the #656
# editor) — added here as the *web-library / plan-mode* slice of PR 11.
# Valorant *live screen-capture detection* remains paused; only the
# browsable library geometry is unblocked. The ``test_fixture_conformance``
# suite enforces every seeded zone has a usable polygon.
_SEEDED_MAP_FIXTURES: tuple[str, ...] = ("cs2_maps.json", "valorant_maps.json")


async def load_fixtures(db: AsyncSession) -> None:
    """Load all fixture data into the database. Idempotent.

    Order: games → agents → utility_types → maps → zones + sites
    (each step depends on the previous one — utility_types resolve their
    ``agent_slug`` against agents, so agents must load first).
    """
    await _load_games(db)
    await _load_agents(db)
    await _load_utility_types(db)
    for fixture_file in _SEEDED_MAP_FIXTURES:
        await _load_maps(db, fixture_file)
    logger.info("fixture_loader: all fixtures loaded")


async def _load_games(db: AsyncSession) -> None:
    games = _load_json("games.json")
    for g in games:
        await game_repo.upsert_game(
            db,
            slug=g["slug"],
            name=g["name"],
            side_a_label=g["side_a_label"],
            side_b_label=g["side_b_label"],
        )
        logger.debug("fixture_loader: upserted game %s", g["slug"])


async def _load_agents(db: AsyncSession) -> None:
    fixture = _load_json("agents.json")
    for entry in fixture:
        game = await game_repo.get_game_by_slug(db, entry["game_slug"])
        if game is None:
            logger.warning(
                "fixture_loader: game %s not found, skipping agents",
                entry["game_slug"],
            )
            continue
        for a in entry["agents"]:
            await game_repo.upsert_agent(
                db,
                game_id=game.id,
                slug=a["slug"],
                name=a["name"],
                role=a.get("role"),
            )
            logger.debug(
                "fixture_loader: upserted agent %s/%s",
                entry["game_slug"],
                a["slug"],
            )


async def _load_utility_types(db: AsyncSession) -> None:
    fixture = _load_json("utility_types.json")
    for entry in fixture:
        game = await game_repo.get_game_by_slug(db, entry["game_slug"])
        if game is None:
            logger.warning(
                "fixture_loader: game %s not found, skipping utility_types",
                entry["game_slug"],
            )
            continue
        for ut in entry["utility_types"]:
            # Valorant utilities carry an ``agent_slug``; resolve it to the
            # agent's id (agents were loaded above). CS2 utilities omit it →
            # agent_id stays NULL.
            agent_id = None
            agent_slug = ut.get("agent_slug")
            if agent_slug:
                agent = await game_repo.get_agent_by_slug(db, game.id, agent_slug)
                if agent is None:
                    logger.warning(
                        "fixture_loader: agent %s/%s not found for utility_type "
                        "%s — leaving agent_id NULL",
                        entry["game_slug"],
                        agent_slug,
                        ut["slug"],
                    )
                else:
                    agent_id = agent.id
            await game_repo.upsert_utility_type(
                db,
                game_id=game.id,
                slug=ut["slug"],
                name=ut["name"],
                agent_id=agent_id,
            )
            logger.debug(
                "fixture_loader: upserted utility_type %s/%s",
                entry["game_slug"],
                ut["slug"],
            )


async def _load_maps(db: AsyncSession, filename: str) -> None:
    fixture = _load_json(filename)
    for entry in fixture:
        game = await game_repo.get_game_by_slug(db, entry["game_slug"])
        if game is None:
            logger.warning(
                "fixture_loader: game %s not found, skipping %s",
                entry["game_slug"],
                filename,
            )
            continue
        for m in entry["maps"]:
            existing_map = await game_repo.upsert_map(
                db,
                game_id=game.id,
                slug=m["slug"],
                name=m["name"],
                minimap_url=m.get("minimap_url"),
            )
            logger.debug(
                "fixture_loader: upserted map %s/%s",
                entry["game_slug"],
                m["slug"],
            )

            for z in m.get("zones", []):
                await game_repo.upsert_map_zone(
                    db,
                    map_id=existing_map.id,
                    slug=z["slug"],
                    name=z["name"],
                    polygon_points=z.get("polygon_points", []),
                )

            for s in m.get("sites", []):
                await game_repo.upsert_site(
                    db,
                    map_id=existing_map.id,
                    slug=s["slug"],
                    name=s["name"],
                )


async def load_fixtures_standalone() -> None:
    """Run the loader in its own session. Used by the CLI."""
    async with unit_of_work() as db:
        await load_fixtures(db)
