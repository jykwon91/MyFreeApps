"""MyBookkeeper mounts phone sign-in, and its tokens pass the app's bearer check.

This suite runs on SQLite, which returns timestamps without a timezone, so session
rows are exercised on Postgres in MyRecipes' copy of these tests instead.
"""
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models.user.user import User
from platform_shared.auth.jwt_backend import IatJWTStrategy
from platform_shared.core.refresh_session_limits import MOBILE_ACCESS_TOKEN_SECONDS


@pytest_asyncio.fixture()
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


def test_every_route_is_mounted() -> None:
    paths = app.openapi()["paths"]
    assert {"post"} <= set(paths["/auth/mobile/login"])
    assert {"post"} <= set(paths["/auth/mobile/refresh"])
    assert {"post"} <= set(paths["/auth/mobile/logout"])
    assert {"get"} <= set(paths["/auth/mobile/sessions"])
    assert {"delete"} <= set(paths["/auth/mobile/sessions/{session_id}"])


@pytest.mark.asyncio
async def test_a_phone_access_token_passes_the_normal_bearer_check(client: AsyncClient, db: AsyncSession) -> None:
    user = User(
        id=uuid.uuid4(),
        email=f"mobile-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="not-used",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    strategy = IatJWTStrategy(secret=settings.secret_key, lifetime_seconds=MOBILE_ACCESS_TOKEN_SECONDS)
    token = await strategy.write_session_token(user, auth_time=datetime.now(timezone.utc))

    response = await client.get("/auth/mobile/sessions", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_a_token_this_app_did_not_issue_is_refused(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/mobile/refresh", json={"refresh_token": f"{uuid.uuid4()}.guess.signature"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "refresh_invalid"
