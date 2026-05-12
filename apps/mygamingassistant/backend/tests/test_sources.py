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
