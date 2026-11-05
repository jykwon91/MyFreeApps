"""Refresh sessions against the real table: what fakes can't show."""
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models.user.refresh_session import RefreshSession
from app.models.user.user import User
from platform_shared.services.refresh_session_service import RefreshSessionService


@pytest_asyncio.fixture
async def sessions(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(db_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def service(sessions: async_sessionmaker[AsyncSession]) -> RefreshSessionService:
    """The service commits each step itself, as it does in production."""

    @asynccontextmanager
    async def unit_of_work() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            async with session.begin():
                yield session

    return RefreshSessionService(
        session_model=RefreshSession,
        user_model=User,
        signing_key="test-signing-key",
        unit_of_work_factory=unit_of_work,
    )


@pytest_asyncio.fixture
async def new_user(
    sessions: async_sessionmaker[AsyncSession], user_factory,
) -> Callable[[], Awaitable[User]]:
    """Registered users. user_factory's cleanup deletes them and, with them, their sessions."""

    async def _create() -> User:
        registered = await user_factory()
        async with sessions() as session:
            user = await session.get(User, uuid.UUID(str(registered["id"])))
        assert user is not None
        return user

    return _create


async def _stored(
    sessions: async_sessionmaker[AsyncSession], session_id: uuid.UUID,
) -> RefreshSession | None:
    async with sessions() as session:
        return await session.get(RefreshSession, session_id)


@pytest.mark.asyncio
async def test_a_session_rotates_and_lists_through_the_database(service, sessions, new_user) -> None:
    user = await new_user()
    issued = await service.issue(user, device_name="Phone")

    rotated = await service.rotate(issued.refresh_token)
    assert rotated is not None and rotated.user.id == user.id

    async with sessions() as session:
        assert [row.id for row in await service.list_active(session, user)] == [issued.session.id]


@pytest.mark.asyncio
async def test_presenting_a_replaced_secret_deletes_the_session(service, sessions, new_user) -> None:
    user = await new_user()
    issued = await service.issue(user)

    owners = await service.rotate(issued.refresh_token)
    for _ in range(2):
        assert await service.rotate(issued.refresh_token) is not None

    assert await service.rotate(owners.refresh_token) is None
    assert await _stored(sessions, issued.session.id) is None


@pytest.mark.asyncio
async def test_a_token_only_touches_its_own_session(service, sessions, new_user) -> None:
    user = await new_user()
    phone = await service.issue(user, device_name="Phone")
    tablet = await service.issue(user, device_name="Tablet")

    rotated = await service.rotate(phone.refresh_token)

    assert rotated.session.id == phone.session.id
    stored_tablet = await _stored(sessions, tablet.session.id)
    assert stored_tablet.current_secret_hash == tablet.session.current_secret_hash


@pytest.mark.asyncio
async def test_only_the_owner_can_revoke_a_session(service, sessions, new_user) -> None:
    owner = await new_user()
    other = await new_user()
    issued = await service.issue(owner)

    assert await service.revoke(other.id, issued.session.id) is False
    assert await _stored(sessions, issued.session.id) is not None
    assert await service.revoke(owner.id, issued.session.id) is True
    assert await _stored(sessions, issued.session.id) is None


@pytest.mark.asyncio
async def test_deleting_a_user_deletes_their_sessions(service, sessions, new_user) -> None:
    user = await new_user()
    await service.issue(user)

    async with sessions() as session:
        async with session.begin():
            await session.execute(delete(User).where(User.id == user.id))

    async with sessions() as session:
        rows = await session.execute(select(RefreshSession).where(RefreshSession.user_id == user.id))
        assert rows.first() is None
