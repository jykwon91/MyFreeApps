"""Only an admin account may send rent reminders by text."""
import uuid

import pytest
from platform_shared.core.permissions import Role
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import User
from app.services.rent.rent_reminder_sms_permission import (
    may_send_texts,
    owner_may_send_texts,
)


@pytest.mark.parametrize(
    ("user", "allowed"),
    [
        (User(role=Role.ADMIN), True),
        (User(role=Role.USER), False),
        (None, False),
    ],
    ids=["admin", "user", "no_account"],
)
def test_may_send_texts(user: User | None, allowed: bool) -> None:
    assert may_send_texts(user) is allowed


async def _saved_user(db: AsyncSession, role: Role) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"owner-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role=role,
    )
    db.add(user)
    await db.commit()
    return user


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "allowed"),
    [(Role.ADMIN, True), (Role.USER, False)],
    ids=["admin", "user"],
)
async def test_owner_may_send_texts_reads_the_saved_role(
    db: AsyncSession, role: Role, allowed: bool,
) -> None:
    owner = await _saved_user(db, role)
    assert await owner_may_send_texts(db, owner.id) is allowed


@pytest.mark.asyncio
async def test_an_owner_with_no_account_may_not_send_texts(db: AsyncSession) -> None:
    assert await owner_may_send_texts(db, uuid.uuid4()) is False
