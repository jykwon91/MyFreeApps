"""Tests for the Source management API (PR 4).

Tests verify:
- POST /api/sources creates a source (playlist + channel)
- POST /api/sources rejects invalid URL
- GET /api/sources lists sources
- GET /api/sources/{id} returns detail
- DELETE /api/sources/{id} soft-deletes
- POST /api/sources/{id}/sync returns 200 with job_id
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.source import Source
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    """Create test user and log in."""
    from fastapi_users.password import PasswordHelper
    from sqlalchemy import select

    TEST_EMAIL = "sources-test@example.com"
    TEST_PASSWORD = "testpassword123!"

    result = await db.execute(select(User).where(User.email == TEST_EMAIL))
    user = result.scalar_one_or_none()
    if user is None:
        helper = PasswordHelper()
        user = User(
            email=TEST_EMAIL,
            hashed_password=helper.hash(TEST_PASSWORD),
            is_verified=True,
            is_active=True,
        )
        db.add(user)
        await db.flush()

    resp = await client.post(
        "/api/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code != 200:
        pytest.skip(f"Auth failed: {resp.status_code}")

    token = resp.json().get("access_token", "")
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest_asyncio.fixture
async def existing_source(db: AsyncSession) -> Source:
    src = Source(
        kind="youtube_playlist",
        config_json={"url": "https://www.youtube.com/playlist?list=PLexisting"},
    )
    db.add(src)
    await db.flush()
    return src


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_playlist_source(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "youtube_playlist",
            "url": "https://www.youtube.com/playlist?list=PLabcdef",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kind"] == "youtube_playlist"
    assert "PLabcdef" in body["config_json"]["url"]
    assert body["last_synced_at"] is None


@pytest.mark.asyncio
async def test_create_channel_source(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "youtube_channel",
            "url": "https://www.youtube.com/@testchannel",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kind"] == "youtube_channel"


@pytest.mark.asyncio
async def test_create_source_rejects_invalid_url(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "youtube_playlist",
            "url": "https://example.com/not-a-youtube-url",
        },
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_create_source_rejects_invalid_kind(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "manual",
            "url": "https://www.youtube.com/playlist?list=PLtest",
        },
    )
    # kind=manual not allowed via API (only youtube_playlist/youtube_channel)
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_list_sources(auth_client: AsyncClient, existing_source: Source):
    resp = await auth_client.get("/api/sources")
    assert resp.status_code == 200, resp.text
    sources = resp.json()
    ids = [s["id"] for s in sources]
    assert str(existing_source.id) in ids


@pytest.mark.asyncio
async def test_get_source_detail(auth_client: AsyncClient, existing_source: Source):
    resp = await auth_client.get(f"/api/sources/{existing_source.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(existing_source.id)
    assert body["kind"] == "youtube_playlist"


@pytest.mark.asyncio
async def test_get_source_404(auth_client: AsyncClient):
    resp = await auth_client.get(f"/api/sources/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_source_soft_deletes(auth_client: AsyncClient, existing_source: Source, db: AsyncSession):
    resp = await auth_client.delete(f"/api/sources/{existing_source.id}")
    assert resp.status_code == 204, resp.text

    from sqlalchemy import select
    result = await db.execute(select(Source).where(Source.id == existing_source.id))
    source = result.scalar_one_or_none()
    # Row still exists (soft delete via config_json.deleted flag)
    assert source is not None
    assert source.config_json.get("deleted") is True


@pytest.mark.asyncio
async def test_delete_source_404(auth_client: AsyncClient):
    resp = await auth_client.delete(f"/api/sources/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_sync_source_returns_job_id(auth_client: AsyncClient, existing_source: Source):
    """POST /api/sources/{id}/sync should return job_id immediately."""
    # Mock the background task execution so we don't actually run ingestion.
    with patch(
        "app.api.sources.ingestion_orchestrator.sync_source",
        new_callable=AsyncMock,
    ):
        resp = await auth_client.post(f"/api/sources/{existing_source.id}/sync")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "job_id" in body
    assert body["source_id"] == str(existing_source.id)
    assert body["status"] == "queued"


@pytest.mark.asyncio
async def test_sync_source_404(auth_client: AsyncClient):
    resp = await auth_client.post(f"/api/sources/{uuid.uuid4()}/sync")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Regressions: playlist watch?v=&list= URL, deleted-source exclusion,
# LineupRead serialization of pending (null game_id/map_id) rows.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_playlist_accepts_watch_list_url(auth_client: AsyncClient):
    """The common 'open a video inside a playlist' URL must be accepted and
    normalized to the canonical /playlist?list= form."""
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "youtube_playlist",
            "url": "https://www.youtube.com/watch?v=Q4Dwg9Z0wZ0&list=PLCv9jk0KUJ",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["config_json"]["url"] == (
        "https://www.youtube.com/playlist?list=PLCv9jk0KUJ"
    )


@pytest.mark.asyncio
async def test_deleted_source_excluded_from_list_and_detail(
    auth_client: AsyncClient, existing_source: Source
):
    """A soft-deleted source must vanish from the list AND 404 on detail."""
    sid = str(existing_source.id)
    assert (await auth_client.delete(f"/api/sources/{sid}")).status_code == 204

    listed = (await auth_client.get("/api/sources")).json()
    assert sid not in [s["id"] for s in listed]
    assert (await auth_client.get(f"/api/sources/{sid}")).status_code == 404
    # DELETE is idempotent — re-deleting an already-deleted source is a clean
    # 204 (soft_delete_source still locates the row via include_deleted=True),
    # never a 500.
    assert (await auth_client.delete(f"/api/sources/{sid}")).status_code == 204


# ---------------------------------------------------------------------------
# Map-scope hint (map_hint / game_hint): validation at create + read surfacing.
# The source-create path opens its own unit_of_work, which the `client` fixture
# binds to the test `db` session — so fixture-seeded game/map rows are visible
# to _resolve_hints. Slugs are suffixed to be isolation-safe vs a pre-seeded
# dev DB (same discipline as test_classifier_service.py).
# ---------------------------------------------------------------------------

_HINT_SUFFIX = uuid.uuid4().hex[:8]


@pytest_asyncio.fixture
async def hint_game_map(db: AsyncSession):
    from app.models.game.game import Game
    from app.models.game.map import Map

    g = Game(
        slug=f"cs2-{_HINT_SUFFIX}",
        name="Counter-Strike 2",
        side_a_label="T",
        side_b_label="CT",
    )
    db.add(g)
    await db.flush()
    m = Map(game_id=g.id, slug=f"mirage-{_HINT_SUFFIX}", name="Mirage")
    db.add(m)
    await db.flush()
    return g, m


@pytest.mark.asyncio
async def test_create_source_with_map_hint_implies_game(
    auth_client: AsyncClient, hint_game_map
):
    """A valid map_hint is stored AND implies its game; both are surfaced and
    persisted into config_json (which drives the ingest classifier scope)."""
    game, mp = hint_game_map
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "youtube_playlist",
            "url": "https://www.youtube.com/playlist?list=PLmaphint",
            "map_hint": mp.slug,
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["map_hint"] == mp.slug
    assert body["game_hint"] == game.slug  # map implies its game
    assert body["config_json"]["map_hint"] == mp.slug
    assert body["config_json"]["game_hint"] == game.slug


@pytest.mark.asyncio
async def test_create_source_with_game_hint_only(
    auth_client: AsyncClient, hint_game_map
):
    """A valid game_hint (no map_hint) is stored; map_hint stays null."""
    game, _ = hint_game_map
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "youtube_playlist",
            "url": "https://www.youtube.com/playlist?list=PLgamehint",
            "game_hint": game.slug,
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["game_hint"] == game.slug
    assert body["map_hint"] is None


@pytest.mark.asyncio
async def test_create_source_unknown_map_hint_returns_422(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "youtube_playlist",
            "url": "https://www.youtube.com/playlist?list=PLbadmap",
            "map_hint": "no-such-map-xyz",
        },
    )
    assert resp.status_code == 422, resp.text
    assert "no-such-map-xyz" in resp.text


@pytest.mark.asyncio
async def test_create_source_unknown_game_hint_returns_422(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "youtube_playlist",
            "url": "https://www.youtube.com/playlist?list=PLbadgame",
            "game_hint": "no-such-game-xyz",
        },
    )
    assert resp.status_code == 422, resp.text
    assert "no-such-game-xyz" in resp.text


@pytest.mark.asyncio
async def test_create_source_without_hints_surfaces_null(auth_client: AsyncClient):
    """Omitting hints leaves both null — back-compat with hint-less sources."""
    resp = await auth_client.post(
        "/api/sources",
        json={
            "kind": "youtube_playlist",
            "url": "https://www.youtube.com/playlist?list=PLnohint",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["game_hint"] is None
    assert body["map_hint"] is None


def test_lineup_read_serializes_pending_row_with_null_game_map():
    """pending_review lineups have NULL game_id/map_id — LineupRead must
    accept them so the review queue can load (regression: 2 uuid errors).

    Asserts BOTH directions: model_validate (input) AND model_dump(mode="json")
    (output). FastAPI's ``response_model=PendingLineupsResponse`` re-serializes
    via model_dump, which is when the @computed_field effective_* properties
    run — that output path, not model_validate, is where the review-queue 500
    actually lived. Testing only model_validate left this uncovered."""
    from app.schemas.game.lineup_schemas import LineupRead

    model = LineupRead.model_validate(
        {
            "id": uuid.uuid4(),
            "game_id": None,
            "map_id": None,
            "title": "B-site smoke",
            "status": "pending_review",
        }
    )
    assert model.game_id is None and model.map_id is None

    # The FastAPI response path: must not raise, and the centroid-fallback
    # computed fields must degrade to None when zones are absent.
    dumped = model.model_dump(mode="json")
    assert dumped["game_id"] is None and dumped["map_id"] is None
    assert dumped["effective_stand_x"] is None
    assert dumped["effective_stand_y"] is None
    assert dumped["effective_target_x"] is None
    assert dumped["effective_target_y"] is None


# ---------------------------------------------------------------------------
# PATCH /api/sources/{id} — set/replace the classification scope on an
# EXISTING source (the create-time hint is otherwise immutable).
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_source_sets_map_hint_implies_game(
    auth_client: AsyncClient, existing_source: Source, hint_game_map
):
    """PATCH sets a map scope on an existing source; map_hint implies its game,
    and pre-existing config_json keys (url) are preserved."""
    game, mp = hint_game_map
    resp = await auth_client.patch(
        f"/api/sources/{existing_source.id}",
        json={"map_hint": mp.slug},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["map_hint"] == mp.slug
    assert body["game_hint"] == game.slug  # map implies its game
    assert body["config_json"]["map_hint"] == mp.slug
    assert body["config_json"]["game_hint"] == game.slug
    assert "PLexisting" in body["config_json"]["url"]  # url untouched


@pytest.mark.asyncio
async def test_update_source_game_hint_only(
    auth_client: AsyncClient, existing_source: Source, hint_game_map
):
    """A lone game_hint sets the coarser game scope; map_hint stays null."""
    game, _ = hint_game_map
    resp = await auth_client.patch(
        f"/api/sources/{existing_source.id}",
        json={"game_hint": game.slug},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["game_hint"] == game.slug
    assert body["map_hint"] is None


@pytest.mark.asyncio
async def test_update_source_clears_scope(
    auth_client: AsyncClient, db: AsyncSession, hint_game_map
):
    """PATCH with both hints null clears a previously-set scope (and leaves
    other config_json keys intact)."""
    game, mp = hint_game_map
    src = Source(
        kind="youtube_playlist",
        config_json={
            "url": "https://www.youtube.com/playlist?list=PLscoped",
            "map_hint": mp.slug,
            "game_hint": game.slug,
        },
    )
    db.add(src)
    await db.flush()

    resp = await auth_client.patch(f"/api/sources/{src.id}", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["map_hint"] is None
    assert body["game_hint"] is None
    assert "map_hint" not in body["config_json"]
    assert "game_hint" not in body["config_json"]
    assert "PLscoped" in body["config_json"]["url"]


@pytest.mark.asyncio
async def test_update_source_unknown_map_hint_returns_422(
    auth_client: AsyncClient, existing_source: Source
):
    resp = await auth_client.patch(
        f"/api/sources/{existing_source.id}",
        json={"map_hint": "no-such-map-zzz"},
    )
    assert resp.status_code == 422, resp.text
    assert "no-such-map-zzz" in resp.text


@pytest.mark.asyncio
async def test_update_source_404(auth_client: AsyncClient):
    resp = await auth_client.patch(f"/api/sources/{uuid.uuid4()}", json={})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/sources/{id}/reclassify — bulk re-run over the source's pending
# lineups. The classifier itself is stubbed; this asserts the route wiring +
# count passthrough (the classify logic is covered in test_classifier_service).
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reclassify_source_returns_counts(
    auth_client: AsyncClient, existing_source: Source
):
    from app.services.game.lineup_service import ReclassifyBatchResult

    with patch(
        "app.api.sources.lineup_service.reclassify_source_pending",
        new_callable=AsyncMock,
        return_value=ReclassifyBatchResult(total=3, reclassified=2, failed=1),
    ):
        resp = await auth_client.post(
            f"/api/sources/{existing_source.id}/reclassify"
        )

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"total": 3, "reclassified": 2, "failed": 1}


@pytest.mark.asyncio
async def test_reclassify_source_404(auth_client: AsyncClient):
    resp = await auth_client.post(f"/api/sources/{uuid.uuid4()}/reclassify")
    assert resp.status_code == 404
