"""game.kind — companion games (WoW Forever) alongside lineup games.

Pins that a game with no maps loads cleanly from fixtures, is exposed with its
kind, stays out of the lineup classifier's reference data, and that the
database still requires side labels on lineup games.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.repositories.game import game_repo
from app.repositories.game.reference_repo import load_reference_data
from app.services.game.fixture_loader import load_fixtures


async def test_fixture_loader_seeds_wow_forever_without_maps(db: AsyncSession) -> None:
    await load_fixtures(db)
    wow = await game_repo.get_game_by_slug(db, "wow-forever")
    assert wow is not None
    assert wow.kind == "companion"
    assert wow.side_a_label is None and wow.side_b_label is None
    assert list(await game_repo.list_maps_for_game(db, wow.id)) == []

    cs2 = await game_repo.get_game_by_slug(db, "cs2")
    assert cs2 is not None and cs2.kind == "lineups"


async def test_games_endpoint_exposes_kind(client: AsyncClient, db: AsyncSession) -> None:
    db.add(Game(slug="kind-companion", name="Companion", kind="companion"))
    await db.flush()
    resp = await client.get("/api/games")
    assert resp.status_code == 200
    by_slug = {g["slug"]: g for g in resp.json()}
    assert by_slug["kind-companion"]["kind"] == "companion"
    assert by_slug["kind-companion"]["side_a_label"] is None


async def test_reference_data_excludes_companion_games(db: AsyncSession) -> None:
    db.add(Game(slug="kind-companion-ref", name="Companion", kind="companion"))
    db.add(Game(slug="kind-lineup-ref", name="Lineup", side_a_label="T", side_b_label="CT"))
    await db.flush()
    slugs = {g["slug"] for g in (await load_reference_data(db, game_id=None))["games"]}
    assert "kind-lineup-ref" in slugs
    assert "kind-companion-ref" not in slugs


async def test_lineup_game_requires_side_labels(db: AsyncSession) -> None:
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(Game(slug="kind-bad", name="Bad", kind="lineups"))
            await db.flush()
