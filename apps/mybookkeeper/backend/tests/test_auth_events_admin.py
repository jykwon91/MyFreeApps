"""Tests for GET /admin/auth-events endpoint."""
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType

from app.core.auth import current_active_user
from app.db.session import get_db
from app.main import app
from app.models.system.auth_event import AuthEvent
from app.models.user.user import Role, User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_user(*, is_superuser: bool = False, role: Role = Role.USER) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"user-{uuid.uuid4()}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=is_superuser,
        is_verified=True,
        role=role,
    )


@pytest.fixture(autouse=True)
def _route_db(db: AsyncSession):
    """Redirect get_db to the test session for all routes."""
    async def _fake_get_db():
        yield db

    app.dependency_overrides[get_db] = _fake_get_db
    yield
    app.dependency_overrides.pop(get_db, None)


async def _seed_events(db: AsyncSession, user_id: uuid.UUID, count: int = 3) -> list[AuthEvent]:
    events = []
    for i in range(count):
        ev = AuthEvent(
            user_id=user_id,
            event_type=AuthEventType.LOGIN_SUCCESS if i % 2 == 0 else AuthEventType.LOGIN_FAILURE,
            ip_address=f"10.0.0.{i + 1}",
            succeeded=i % 2 == 0,
            metadata={},
        )
        db.add(ev)
        events.append(ev)
    await db.commit()
    for ev in events:
        await db.refresh(ev)
    return events


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_admin_can_list_events(db: AsyncSession) -> None:
    admin = _make_user(role=Role.ADMIN)
    db.add(admin)
    await db.commit()
    await db.refresh(admin)

    user_id = uuid.uuid4()
    await _seed_events(db, user_id, count=3)

    app.dependency_overrides[current_active_user] = lambda: admin
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/admin/auth-events")
    finally:
        app.dependency_overrides.pop(current_active_user, None)

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 3


@pytest.mark.anyio
async def test_non_admin_blocked(db: AsyncSession) -> None:
    regular_user = _make_user(role=Role.USER)
    db.add(regular_user)
    await db.commit()
    await db.refresh(regular_user)

    app.dependency_overrides[current_active_user] = lambda: regular_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/admin/auth-events")
    finally:
        app.dependency_overrides.pop(current_active_user, None)

    assert resp.status_code == 403


@pytest.mark.anyio
async def test_filter_by_event_type(db: AsyncSession) -> None:
    admin = _make_user(role=Role.ADMIN)
    db.add(admin)
    await db.commit()
    await db.refresh(admin)

    user_id = uuid.uuid4()
    await _seed_events(db, user_id, count=4)  # mix of login.success and login.failure

    app.dependency_overrides[current_active_user] = lambda: admin
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/admin/auth-events",
                params={"event_type": AuthEventType.LOGIN_SUCCESS},
            )
    finally:
        app.dependency_overrides.pop(current_active_user, None)

    assert resp.status_code == 200
    data = resp.json()
    assert all(ev["event_type"] == AuthEventType.LOGIN_SUCCESS for ev in data)
    # With 4 seeded events (0,2=success; 1,3=failure), 2 successes
    assert len(data) == 2


@pytest.mark.anyio
async def test_filter_by_user_id(db: AsyncSession) -> None:
    admin = _make_user(role=Role.ADMIN)
    db.add(admin)
    await db.commit()
    await db.refresh(admin)

    user_a = uuid.uuid4()
    user_b = uuid.uuid4()
    await _seed_events(db, user_a, count=2)
    await _seed_events(db, user_b, count=3)

    app.dependency_overrides[current_active_user] = lambda: admin
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/admin/auth-events",
                params={"user_id": str(user_a)},
            )
    finally:
        app.dependency_overrides.pop(current_active_user, None)

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert all(ev["user_id"] == str(user_a) for ev in data)


@pytest.mark.anyio
async def test_unauthenticated_blocked() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/admin/auth-events")
    assert resp.status_code == 401
