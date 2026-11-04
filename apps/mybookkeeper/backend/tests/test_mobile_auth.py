"""Mobile sign-in reaches MyBookkeeper's own bearer check and session cutoff."""
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models.user.refresh_session import RefreshSession
from app.models.user.user import User
from platform_shared.services.refresh_session_service import RefreshSessionService

_SERVICE = RefreshSessionService(
    session_model=RefreshSession, user_model=User, signing_key=settings.secret_key,
)


@pytest_asyncio.fixture()
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


async def _user(db: AsyncSession) -> User:
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
    return user


async def _refresh_token(db: AsyncSession, user: User) -> str:
    issued = await _SERVICE.issue(db, user, device_name="Phone")
    await db.commit()
    return issued.refresh_token


@pytest.mark.asyncio
async def test_a_refreshed_token_passes_the_normal_bearer_check(client: AsyncClient, db: AsyncSession) -> None:
    user = await _user(db)
    response = await client.post(
        "/auth/mobile/refresh", json={"refresh_token": await _refresh_token(db, user)},
    )
    assert response.status_code == 200, response.text
    assert response.json()["expires_in"] == 30 * 60

    listed = await client.get(
        "/auth/mobile/sessions", headers={"Authorization": f"Bearer {response.json()['access_token']}"},
    )
    assert listed.status_code == 200
    assert [row["device_name"] for row in listed.json()] == ["Phone"]


@pytest.mark.asyncio
async def test_a_session_cutoff_ends_the_device(client: AsyncClient, db: AsyncSession) -> None:
    user = await _user(db)
    token = await _refresh_token(db, user)
    user.auth_valid_after = datetime.now(timezone.utc) + timedelta(seconds=1)
    await db.commit()

    response = await client.post("/auth/mobile/refresh", json={"refresh_token": token})
    assert response.status_code == 401
    assert response.json()["detail"] == "refresh_invalid"
