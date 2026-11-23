"""A settled turn's ``turn_count`` bump is audited.

It used to be a bulk ``UPDATE ... SET turn_count = turn_count + 1``, which the
audit listener never sees. The ``db`` fixture rolls back, so the rows (audit
rows included) never outlive the test.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import audit_listener_attached
from platform_shared.testing.audited_write_case import AuditedWriteCase, run_audited_write_case
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AUDIT_CONFIG
from app.models.tutor.tutor_session import TutorSession
from app.models.user.user import User
from app.repositories.tutor import tutor_session_repository

ACTOR = uuid.uuid4()


@pytest.fixture()
def audit_listener() -> Iterator[None]:
    with audit_listener_attached(AUDIT_CONFIG):
        yield


async def _session(db: AsyncSession) -> TutorSession:
    owner = User(
        email=f"turn-count-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(owner)
    await db.flush()
    session = TutorSession(
        user_id=owner.id, language_code="es", scenario_slug="cafe", level="beginner", turn_count=2,
    )
    db.add(session)
    await db.flush()
    return session


@pytest.mark.usefixtures("audit_listener")
async def test_increment_turn_count_is_audited_as_the_actor(db: AsyncSession) -> None:
    case = AuditedWriteCase(
        "tutor_session.increment_turn_count", _session,
        lambda db, session: tutor_session_repository.increment_turn_count(db, session.id, session.user_id),
        "UPDATE", frozenset({"turn_count"}),
    )
    await run_audited_write_case(db, case, actor=ACTOR)

    logs = (await db.execute(
        select(AuditLog).where(AuditLog.table_name == "tutor_session", AuditLog.field_name == "turn_count"),
    )).scalars().all()
    assert [(log.old_value, log.new_value) for log in logs] == [("2", "3")]


@pytest.mark.usefixtures("audit_listener")
async def test_another_users_session_is_not_counted(db: AsyncSession) -> None:
    session = await _session(db)
    await db.flush()  # the seed's INSERT audit rows are written on the next flush
    await db.execute(AuditLog.__table__.delete())

    await tutor_session_repository.increment_turn_count(db, session.id, uuid.uuid4())

    await db.refresh(session)
    assert session.turn_count == 2
    assert (await db.execute(select(AuditLog))).scalars().all() == []
