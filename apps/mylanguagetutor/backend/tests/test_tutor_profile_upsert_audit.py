"""Saving the tutor profile is audited.

``tutor_profile_repository.upsert`` used ``INSERT ... ON CONFLICT DO UPDATE``,
which the audit listener never sees. It now writes through the ORM: the first
save leaves INSERT audit rows and a later one UPDATE rows, both naming the
actor. The ``db`` fixture rolls back, so no rows outlive the test.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from platform_shared.core.audit_actor import audit_actor
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import audit_listener_attached
from platform_shared.testing.audited_write_case import assert_row_audited
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AUDIT_CONFIG
from app.domain.languages import LANGUAGE_CODES
from app.domain.levels import LEVEL_CODES
from app.models.user.user import User
from app.repositories.tutor import tutor_profile_repository


@pytest.fixture()
def audit_listener() -> Iterator[None]:
    with audit_listener_attached(AUDIT_CONFIG):
        yield


async def _user_id(db: AsyncSession) -> uuid.UUID:
    owner = User(
        email=f"profile-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
    )
    db.add(owner)
    await db.flush()
    await db.flush()  # the seed's INSERT audit rows are written on the next flush
    await db.execute(AuditLog.__table__.delete())
    return owner.id


@pytest.mark.usefixtures("audit_listener")
async def test_the_first_save_is_audited_as_an_insert(db: AsyncSession) -> None:
    user_id = await _user_id(db)

    with audit_actor(user_id):
        profile = await tutor_profile_repository.upsert(db, user_id, LANGUAGE_CODES[0], LEVEL_CODES[0])

    assert (profile.language_code, profile.level) == (LANGUAGE_CODES[0], LEVEL_CODES[0])
    await assert_row_audited(
        db, profile, operation="INSERT", actor=user_id, fields=frozenset({"user_id", "language_code", "level"}),
    )


@pytest.mark.usefixtures("audit_listener")
async def test_a_later_save_is_audited_as_an_update(db: AsyncSession) -> None:
    user_id = await _user_id(db)
    first = await tutor_profile_repository.upsert(db, user_id, LANGUAGE_CODES[0], LEVEL_CODES[0])
    created_at = first.created_at
    await db.flush()
    await db.execute(AuditLog.__table__.delete())

    with audit_actor(user_id):
        profile = await tutor_profile_repository.upsert(db, user_id, LANGUAGE_CODES[0], LEVEL_CODES[1])

    assert profile is first
    assert (profile.language_code, profile.level, profile.created_at) == (
        LANGUAGE_CODES[0], LEVEL_CODES[1], created_at,
    )
    await assert_row_audited(
        db, profile, operation="UPDATE", actor=user_id, fields=frozenset({"level", "updated_at"}),
    )
