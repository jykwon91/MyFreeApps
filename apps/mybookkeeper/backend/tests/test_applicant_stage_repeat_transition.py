"""A repeated stage transition must be a harmless no-op, and the applicant row locked.

Two concurrent requests for the same move (double click) are serialised by a
row lock; the second then finds the applicant already at the requested stage.
SQLite ignores FOR UPDATE, so the lock is asserted via the repo call and the
repeat is exercised sequentially.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import event, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import ORMExecuteState

from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.repositories.applicants import applicant_lock_repo
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.services.applicants import applicant_stage_service
from app.services.applicants.applicant_stage_service import (
    InvalidTransitionError,
    transition_stage,
)


def _fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


async def _seed(db: AsyncSession, stage: str) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    applicant = Applicant(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, stage=stage)
    db.add(applicant)
    await db.flush()
    return org_id, user_id, applicant.id


def _detail(org_id: uuid.UUID, user_id: uuid.UUID, applicant_id: uuid.UUID, stage: str) -> ApplicantDetailResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return ApplicantDetailResponse(
        id=applicant_id, organization_id=org_id, user_id=user_id, inquiry_id=None,
        legal_name=None, stage=stage, created_at=now, updated_at=now,
    )


async def _events(db: AsyncSession, applicant_id: uuid.UUID) -> list[ApplicantEvent]:
    result = await db.execute(
        select(ApplicantEvent).where(
            ApplicantEvent.applicant_id == applicant_id,
            ApplicantEvent.event_type == "stage_changed",
        ),
    )
    return list(result.scalars())


async def _move(db: AsyncSession, ids: tuple[uuid.UUID, uuid.UUID, uuid.UUID], stage: str) -> None:
    org_id, user_id, applicant_id = ids
    with patch.object(applicant_stage_service, "unit_of_work", _fake_uow(db)), patch.object(
        applicant_stage_service.applicant_service,
        "get_applicant",
        new=AsyncMock(return_value=_detail(org_id, user_id, applicant_id, stage)),
    ):
        await transition_stage(
            organization_id=org_id, user_id=user_id, applicant_id=applicant_id,
            new_stage=stage, note=None,
        )


@pytest.mark.asyncio
async def test_repeating_the_same_transition_succeeds_and_writes_one_event(db: AsyncSession) -> None:
    ids = await _seed(db, "lead")

    await _move(db, ids, "approved")
    await _move(db, ids, "approved")

    applicant = await db.get(Applicant, ids[2])
    assert applicant is not None and applicant.stage == "approved"
    assert len(await _events(db, ids[2])) == 1


@pytest.mark.asyncio
async def test_a_genuinely_invalid_transition_still_raises(db: AsyncSession) -> None:
    ids = await _seed(db, "lease_signed")

    with pytest.raises(InvalidTransitionError):
        await _move(db, ids, "lead")
    assert await _events(db, ids[2]) == []


@pytest.mark.asyncio
async def test_transition_reads_the_applicant_with_a_row_lock(db: AsyncSession) -> None:
    ids = await _seed(db, "lead")
    org_id, user_id, applicant_id = ids

    with patch.object(
        applicant_stage_service.applicant_lock_repo,
        "get_for_update",
        wraps=applicant_lock_repo.get_for_update,
    ) as spy:
        await _move(db, ids, "approved")

    spy.assert_awaited_once()
    assert spy.call_args.kwargs["applicant_id"] == applicant_id
    assert spy.call_args.kwargs["organization_id"] == org_id


@pytest.mark.asyncio
async def test_locking_read_emits_select_for_update(db: AsyncSession) -> None:
    ids = await _seed(db, "lead")
    statements: list[str] = []

    @event.listens_for(db.sync_session, "do_orm_execute")
    def _capture(state: ORMExecuteState) -> None:
        statements.append(str(state.statement.compile(dialect=postgresql.dialect())))

    org_id, user_id, applicant_id = ids
    found = await applicant_lock_repo.get_for_update(
        db, applicant_id=applicant_id, organization_id=org_id, user_id=user_id,
    )

    assert found is not None
    assert any("FOR UPDATE OF applicants" in sql for sql in statements)
