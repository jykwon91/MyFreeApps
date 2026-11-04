"""Refresh sessions against the real table: what fakes can't show."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.refresh_session import RefreshSession
from app.models.user.user import User
from platform_shared.services.refresh_session_service import RefreshSessionService

_SERVICE = RefreshSessionService(session_model=RefreshSession, user_model=User)


async def _new_user(db: AsyncSession, user_factory) -> User:
    registered = await user_factory()
    user = await db.get(User, uuid.UUID(str(registered["id"])))
    assert user is not None
    return user


@pytest.mark.asyncio
async def test_a_session_rotates_and_lists_through_the_database(db: AsyncSession, user_factory) -> None:
    user = await _new_user(db, user_factory)
    issued = await _SERVICE.issue(db, user, auth_time=datetime.now(timezone.utc), device_name="Phone")
    await db.flush()

    rotated = await _SERVICE.rotate(db, issued.refresh_token)
    assert rotated is not None and rotated.user.id == user.id
    await db.flush()

    assert [row.id for row in await _SERVICE.list_active(db, user)] == [issued.session.id]


@pytest.mark.asyncio
async def test_presenting_an_abandoned_secret_deletes_the_session(db: AsyncSession, user_factory) -> None:
    user = await _new_user(db, user_factory)
    issued = await _SERVICE.issue(db, user, auth_time=datetime.now(timezone.utc))
    await db.flush()
    session_id = issued.session.id

    owners = await _SERVICE.rotate(db, issued.refresh_token)
    await db.flush()
    assert await _SERVICE.rotate(db, issued.refresh_token) is not None
    await db.flush()

    assert await _SERVICE.rotate(db, owners.refresh_token) is None
    await db.flush()
    assert (await db.execute(select(RefreshSession).where(RefreshSession.id == session_id))).first() is None


@pytest.mark.asyncio
async def test_only_the_owner_can_revoke_a_session(db: AsyncSession, user_factory) -> None:
    owner = await _new_user(db, user_factory)
    other = await _new_user(db, user_factory)
    issued = await _SERVICE.issue(db, owner, auth_time=datetime.now(timezone.utc))
    await db.flush()
    session_id = issued.session.id

    assert await _SERVICE.revoke(db, other.id, session_id) is False
    assert await _SERVICE.revoke(db, owner.id, session_id) is True
    assert (await db.execute(select(RefreshSession).where(RefreshSession.id == session_id))).first() is None


@pytest.mark.asyncio
async def test_deleting_a_user_deletes_their_sessions(db: AsyncSession, user_factory) -> None:
    user = await _new_user(db, user_factory)
    await _SERVICE.issue(db, user, auth_time=datetime.now(timezone.utc))
    await db.flush()
    user_id = user.id

    await db.execute(delete(User).where(User.id == user_id))
    await db.flush()

    rows = await db.execute(select(RefreshSession).where(RefreshSession.user_id == user_id))
    assert rows.first() is None
