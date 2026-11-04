"""Refresh sessions against the real table: what fakes can't show."""
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.refresh_session import RefreshSession
from app.models.user.user import User
from platform_shared.services.refresh_session_service import RefreshSessionService

_SERVICE = RefreshSessionService(
    session_model=RefreshSession, user_model=User, signing_key="test-signing-key",
)


@pytest_asyncio.fixture
async def new_user(db: AsyncSession, user_factory) -> AsyncGenerator[Callable[[], Awaitable[User]], None]:
    """Load registered users into the test's transaction.

    The rollback runs before user_factory's cleanup. A session row holds a lock on
    its user until the transaction ends, and the cleanup deletes that user.
    """

    async def _create() -> User:
        registered = await user_factory()
        user = await db.get(User, uuid.UUID(str(registered["id"])))
        assert user is not None
        return user

    yield _create
    await db.rollback()


@pytest.mark.asyncio
async def test_a_session_rotates_and_lists_through_the_database(db: AsyncSession, new_user) -> None:
    user = await new_user()
    issued = await _SERVICE.issue(db, user, auth_time=datetime.now(timezone.utc), device_name="Phone")
    await db.flush()

    rotated = await _SERVICE.rotate(db, issued.refresh_token)
    assert rotated is not None and rotated.user.id == user.id
    await db.flush()

    assert [row.id for row in await _SERVICE.list_active(db, user)] == [issued.session.id]


@pytest.mark.asyncio
async def test_presenting_a_replaced_secret_deletes_the_session(db: AsyncSession, new_user) -> None:
    user = await new_user()
    issued = await _SERVICE.issue(db, user, auth_time=datetime.now(timezone.utc))
    await db.flush()
    session_id = issued.session.id

    owners = await _SERVICE.rotate(db, issued.refresh_token)
    await db.flush()
    for _ in range(2):
        assert await _SERVICE.rotate(db, issued.refresh_token) is not None
        await db.flush()
        db.expire_all()

    assert await _SERVICE.rotate(db, owners.refresh_token) is None
    await db.flush()
    assert (await db.execute(select(RefreshSession).where(RefreshSession.id == session_id))).first() is None


@pytest.mark.asyncio
async def test_only_the_owner_can_revoke_a_session(db: AsyncSession, new_user) -> None:
    owner = await new_user()
    other = await new_user()
    issued = await _SERVICE.issue(db, owner, auth_time=datetime.now(timezone.utc))
    await db.flush()
    session_id = issued.session.id

    assert await _SERVICE.revoke(db, other.id, session_id) is False
    assert await _SERVICE.revoke(db, owner.id, session_id) is True
    assert (await db.execute(select(RefreshSession).where(RefreshSession.id == session_id))).first() is None


@pytest.mark.asyncio
async def test_deleting_a_user_deletes_their_sessions(db: AsyncSession, new_user) -> None:
    user = await new_user()
    await _SERVICE.issue(db, user, auth_time=datetime.now(timezone.utc))
    await db.flush()
    user_id = user.id

    await db.execute(delete(User).where(User.id == user_id))
    await db.flush()

    rows = await db.execute(select(RefreshSession).where(RefreshSession.user_id == user_id))
    assert rows.first() is None
