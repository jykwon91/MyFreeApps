"""Round-trip tests for the lineup-library publish pipeline (PR B).

Exercises the real export → clear → import path that seeds prod's read-only
library from a committed pack (apps/.../backend/data/lineup_library.json):

- ``lineup_exporter.build_pack`` dumps accepted lineups with FKs as SLUGS and
  verbatim lineup/source UUIDs;
- ``lineup_importer.import_pack`` resolves those slugs to the local prod-side
  UUIDs and upserts zones (force-publishing refined polygons) + sources (by
  id) + lineups (by verbatim id).

Fully transactional — every test runs on the SAVEPOINT-bound ``db`` fixture
(conftest) and rolls back at teardown, so the shared dev DB is NEVER mutated
(no DROP, no commit). The CLI-dispatch smoke mocks the importer so even it
cannot reach a real database.

Isolation note: ``build_pack`` reads the WHOLE accepted library, and the
shared local dev DB already holds ~35 real accepted lineups. So every test
seeds its own ``rt-*`` taxonomy and scopes assertions + re-import to that one
game via :func:`_scope_pack` — it never asserts global counts and never
deletes a lineup it didn't create.
"""
from __future__ import annotations

import sys
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.source import Source
from app.models.game.utility_type import UtilityType
from app.services.game.lineup_exporter import (
    LINEUP_SCALAR_FIELDS,
    PACK_VERSION,
    build_pack,
)
from app.services.game.lineup_importer import ImportStats, PackError, import_pack

_RT_GAME = "rt-game"
_A_SITE_POLY = [{"x": 0.10, "y": 0.10}, {"x": 0.20, "y": 0.10}, {"x": 0.20, "y": 0.20}]


@pytest_asyncio.fixture
async def seeded(db: AsyncSession) -> dict:
    """A self-contained taxonomy: game, map, 2 zones (one with a polygon), util, source.

    Uses ``rt-`` slugs (not real ``cs2`` / ``mirage``) so the fixture never
    collides with the real taxonomy that already lives in the shared local dev
    DB — ``game.slug`` is globally unique. The round-trip is self-consistent:
    build_pack reads whatever slugs we seed and import resolves them back.
    """
    game = Game(slug=_RT_GAME, name="RT Game", side_a_label="T", side_b_label="CT")
    db.add(game)
    await db.flush()

    map_obj = Map(game_id=game.id, slug="rt-map", name="RT Map")
    db.add(map_obj)
    await db.flush()

    zone_a = MapZone(
        map_id=map_obj.id, slug="rt-a-site", name="A Site", polygon_points=_A_SITE_POLY
    )
    zone_t = MapZone(
        map_id=map_obj.id, slug="rt-t-spawn", name="T Spawn", polygon_points=[]
    )
    db.add_all([zone_a, zone_t])
    await db.flush()

    util = UtilityType(game_id=game.id, slug="rt-smoke", name="Smoke")
    db.add(util)
    await db.flush()

    source = Source(
        kind="youtube_playlist",
        config_json={"url": "https://youtube.com/playlist?list=ROUNDTRIP"},
    )
    db.add(source)
    await db.flush()

    return {
        "game": game,
        "map": map_obj,
        "zone_a": zone_a,
        "zone_t": zone_t,
        "util": util,
        "source": source,
    }


async def _make_accepted(db: AsyncSession, seeded: dict, *, title: str, **overrides) -> Lineup:
    fields = dict(
        game_id=seeded["game"].id,
        map_id=seeded["map"].id,
        target_zone_id=seeded["zone_a"].id,
        stand_zone_id=seeded["zone_t"].id,
        utility_type_id=seeded["util"].id,
        side="side_a",
        title=title,
        status="accepted",
        source_id=seeded["source"].id,
        clip_url="u/l/throw.mp4",
        stand_screenshot_url="u/l/stand.png",
        aim_screenshot_url="u/l/aim.png",
        stand_clip_url="u/l/stand.mp4",
        aim_clip_url="u/l/aim.mp4",
        landing_clip_url="u/l/landing.mp4",
        aim_anchor_x=0.5,
        aim_anchor_y=0.4,
        setup_seconds=8,
        technique="Jumpthrow",
        youtube_video_id="vid12345",
        chapter_start_seconds=42,
        chapter_title="A site smoke",
        attribution_author="Tigerr",
    )
    fields.update(overrides)
    lineup = Lineup(**fields)
    db.add(lineup)
    await db.flush()
    return lineup


def _scope_pack(pack: dict, *, game_slug: str = _RT_GAME) -> dict:
    """Slice a full library pack down to one game's entities.

    ``build_pack`` exports the whole accepted library (which, in the shared dev
    DB, includes the real cs2/anubis lineups). Scoping to the test's ``rt-game``
    keeps assertions and re-import isolated from rows the test didn't create.
    """
    lineups = [ln for ln in pack["lineups"] if ln["game_slug"] == game_slug]
    zones = [z for z in pack["zones"] if z["game_slug"] == game_slug]
    src_ids = {ln["source_id"] for ln in lineups if ln["source_id"]}
    sources = [s for s in pack["sources"] if s["id"] in src_ids]
    return {
        "version": pack["version"],
        "lineup_count": len(lineups),
        "zones": zones,
        "sources": sources,
        "lineups": lineups,
    }


async def _scoped_pack(db: AsyncSession) -> dict:
    return _scope_pack(await build_pack(db))


async def _delete(db: AsyncSession, *lineups: Lineup) -> None:
    """ORM-delete specific lineups (so the importer's db.get upsert sees a miss).

    Only ever deletes lineups the test created — never the real library rows."""
    for lineup in lineups:
        await db.delete(lineup)
    await db.flush()


async def _count_by_ids(db: AsyncSession, ids: set[uuid.UUID]) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(Lineup).where(Lineup.id.in_(ids))
        )
    ).scalar_one()


@pytest.mark.asyncio
async def test_export_shape_carries_slugs_and_verbatim_ids(db: AsyncSession, seeded: dict):
    l1 = await _make_accepted(db, seeded, title="Smoke A")

    pack = await _scoped_pack(db)

    assert pack["version"] == PACK_VERSION
    assert pack["lineup_count"] == 1
    entry = pack["lineups"][0]
    # Identity travels verbatim; FKs travel as slugs.
    assert entry["id"] == str(l1.id)
    assert entry["game_slug"] == _RT_GAME
    assert entry["map_slug"] == "rt-map"
    assert entry["utility_type_slug"] == "rt-smoke"
    assert entry["target_zone_slug"] == "rt-a-site"
    assert entry["stand_zone_slug"] == "rt-t-spawn"
    assert entry["side"] == "side_a"
    assert entry["source_id"] == str(seeded["source"].id)
    # Public scalar columns present; operator-only fields absent.
    assert entry["clip_url"] == "u/l/throw.mp4"
    assert entry["technique"] == "Jumpthrow"
    assert "clip_url_original" not in entry
    assert "stand_clip_offset_s" not in entry
    assert "suggested_game_id" not in entry
    assert "stand_ts" not in entry
    # Referenced zones + source deduped.
    assert {z["zone_slug"] for z in pack["zones"]} == {"rt-a-site", "rt-t-spawn"}
    assert len(pack["sources"]) == 1


@pytest.mark.asyncio
async def test_export_import_roundtrip_resolves_slugs_to_prod_uuids(
    db: AsyncSession, seeded: dict
):
    l1 = await _make_accepted(db, seeded, title="Smoke A")
    l2 = await _make_accepted(db, seeded, title="Smoke B", clip_url="u/l2/throw.mp4")
    original_ids = {l1.id, l2.id}

    pack = await _scoped_pack(db)
    assert pack["lineup_count"] == 2

    await _delete(db, l1, l2)
    assert await _count_by_ids(db, original_ids) == 0

    stats = await import_pack(db, pack)
    assert stats.lineups_upserted == 2
    assert stats.zones_upserted == 2
    assert stats.sources_upserted == 1

    rows = (
        await db.execute(
            select(Lineup).where(Lineup.id.in_(original_ids)).order_by(Lineup.title)
        )
    ).scalars().all()
    assert {r.id for r in rows} == original_ids  # verbatim ids preserved
    smoke_a = rows[0]
    assert smoke_a.title == "Smoke A"
    # Slugs resolved back to the SAME prod-side UUIDs.
    assert smoke_a.game_id == seeded["game"].id
    assert smoke_a.map_id == seeded["map"].id
    assert smoke_a.target_zone_id == seeded["zone_a"].id
    assert smoke_a.stand_zone_id == seeded["zone_t"].id
    assert smoke_a.utility_type_id == seeded["util"].id
    assert smoke_a.source_id == seeded["source"].id
    # Scalars + forced status survive the round-trip.
    assert smoke_a.status == "accepted"
    assert smoke_a.side == "side_a"
    assert smoke_a.clip_url == "u/l/throw.mp4"
    assert smoke_a.setup_seconds == 8
    assert smoke_a.technique == "Jumpthrow"
    assert smoke_a.attribution_author == "Tigerr"


@pytest.mark.asyncio
async def test_import_is_idempotent(db: AsyncSession, seeded: dict):
    l1 = await _make_accepted(db, seeded, title="Smoke A")
    pack = await _scoped_pack(db)
    await _delete(db, l1)

    await import_pack(db, pack)
    await import_pack(db, pack)  # re-run must converge, not duplicate

    assert await _count_by_ids(db, {l1.id}) == 1


@pytest.mark.asyncio
async def test_import_force_publishes_refined_polygon(db: AsyncSession, seeded: dict):
    """A refined polygon in the pack overwrites prod's existing one (serve-only
    prod has no editor to redraw it). Backfill-only upsert would NOT overwrite."""
    await _make_accepted(db, seeded, title="Smoke A")
    zone_a_id = seeded["zone_a"].id  # capture before expire_all (expired attr access = sync IO)
    pack = await _scoped_pack(db)

    refined = [{"x": 0.50, "y": 0.50}, {"x": 0.60, "y": 0.50}, {"x": 0.60, "y": 0.60}]
    for zone in pack["zones"]:
        if zone["zone_slug"] == "rt-a-site":
            zone["polygon_points"] = refined

    # Prod currently has a DIFFERENT non-empty polygon for rt-a-site.
    seeded["zone_a"].polygon_points = [
        {"x": 0.90, "y": 0.90},
        {"x": 0.80, "y": 0.90},
        {"x": 0.80, "y": 0.80},
    ]
    await db.flush()

    await import_pack(db, pack)

    # Re-read from the DB (not the in-session object) to prove it persisted.
    db.expire_all()
    refreshed = (
        await db.execute(select(MapZone).where(MapZone.id == zone_a_id))
    ).scalar_one()
    assert refreshed.polygon_points == refined


@pytest.mark.asyncio
async def test_import_rejects_wrong_pack_version(db: AsyncSession):
    bad = {"version": PACK_VERSION + 999, "zones": [], "sources": [], "lineups": []}
    with pytest.raises(PackError, match="version"):
        await import_pack(db, bad)


@pytest.mark.asyncio
async def test_import_fails_loud_on_unseeded_game_slug(db: AsyncSession):
    """A lineup whose game slug isn't seeded (fixtures not loaded) aborts the
    whole import rather than silently skipping."""
    lineup = {
        "id": str(uuid.uuid4()),
        "game_slug": "no-such-game-rt",
        "map_slug": "rt-map",
        "target_zone_slug": "rt-a-site",
        "stand_zone_slug": "rt-t-spawn",
        "utility_type_slug": "rt-smoke",
        "source_id": None,
    }
    for scalar in LINEUP_SCALAR_FIELDS:
        lineup[scalar] = None
    lineup["side"] = "side_a"
    pack = {"version": PACK_VERSION, "zones": [], "sources": [], "lineups": [lineup]}

    with pytest.raises(PackError, match="game slug"):
        await import_pack(db, pack)


def test_cli_dispatch_routes_import_lineups(monkeypatch):
    """`python -m app.cli import-lineups <path>` dispatches to the importer with
    the path. Mocked so the smoke test never opens a real DB session."""
    import app.cli as cli

    called: dict = {}

    async def _fake_standalone(path=None):
        called["path"] = path
        return ImportStats(lineups_upserted=3, zones_upserted=2, sources_upserted=1)

    monkeypatch.setattr(
        "app.services.game.lineup_importer.import_lineups_standalone",
        _fake_standalone,
    )
    monkeypatch.setattr(sys, "argv", ["app.cli", "import-lineups", "/tmp/pack.json"])

    cli.main()

    assert called["path"] == "/tmp/pack.json"
