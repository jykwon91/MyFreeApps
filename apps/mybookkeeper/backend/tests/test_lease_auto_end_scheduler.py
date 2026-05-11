"""Tests for the auto-end-replaced-leases scheduler task.

The task finds signed/active parent leases whose successor's ``starts_on``
has arrived and transitions them to ``ended``. Per-row failures are logged
and do not stop the cycle.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.leases.signed_lease import SignedLease
from app.workers.scheduler_worker import auto_end_replaced_leases


def _fake_uow_for(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


async def _seed_lease(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    status: str = "active",
    starts_on: _dt.date | None = _dt.date(2026, 1, 1),
    ends_on: _dt.date | None = _dt.date(2026, 12, 31),
    parent_lease_id: uuid.UUID | None = None,
    deleted_at: _dt.datetime | None = None,
) -> SignedLease:
    applicant = Applicant(
        organization_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        legal_name="Tenant",
    )
    db.add(applicant)
    await db.flush()
    lease = SignedLease(
        user_id=user_id,
        organization_id=org_id,
        applicant_id=applicant.id,
        kind="imported",
        status=status,
        starts_on=starts_on,
        ends_on=ends_on,
        parent_lease_id=parent_lease_id,
        deleted_at=deleted_at,
    )
    db.add(lease)
    await db.flush()
    return lease


@pytest.mark.asyncio
async def test_auto_ends_parent_when_successor_started(
    db: AsyncSession,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id, status="active")
    # Successor that started yesterday — parent should be ended.
    await _seed_lease(
        db,
        user_id=user_id,
        org_id=org_id,
        status="active",
        starts_on=_dt.date.today() - _dt.timedelta(days=1),
        parent_lease_id=parent.id,
    )

    with patch(
        "app.workers.scheduler_worker.unit_of_work", _fake_uow_for(db),
    ):
        n = await auto_end_replaced_leases()

    assert n == 1
    await db.refresh(parent)
    assert parent.status == "ended"
    assert parent.ended_at is not None


@pytest.mark.asyncio
async def test_skips_parent_when_successor_in_future(
    db: AsyncSession,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id, status="active")
    await _seed_lease(
        db,
        user_id=user_id,
        org_id=org_id,
        starts_on=_dt.date.today() + _dt.timedelta(days=30),
        parent_lease_id=parent.id,
    )

    with patch(
        "app.workers.scheduler_worker.unit_of_work", _fake_uow_for(db),
    ):
        n = await auto_end_replaced_leases()

    assert n == 0
    await db.refresh(parent)
    assert parent.status == "active"


@pytest.mark.asyncio
async def test_skips_parent_in_non_eligible_status(
    db: AsyncSession,
) -> None:
    """Parent in draft / generated / sent / ended / terminated → never auto-ended."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id, status="draft")
    await _seed_lease(
        db,
        user_id=user_id,
        org_id=org_id,
        starts_on=_dt.date.today() - _dt.timedelta(days=1),
        parent_lease_id=parent.id,
    )

    with patch(
        "app.workers.scheduler_worker.unit_of_work", _fake_uow_for(db),
    ):
        n = await auto_end_replaced_leases()

    assert n == 0
    await db.refresh(parent)
    assert parent.status == "draft"


@pytest.mark.asyncio
async def test_skips_when_successor_soft_deleted(
    db: AsyncSession,
) -> None:
    """Soft-deleted successor must NOT auto-end the parent."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id, status="active")
    await _seed_lease(
        db,
        user_id=user_id,
        org_id=org_id,
        starts_on=_dt.date.today() - _dt.timedelta(days=1),
        parent_lease_id=parent.id,
        deleted_at=_dt.datetime.now(_dt.timezone.utc),
    )

    with patch(
        "app.workers.scheduler_worker.unit_of_work", _fake_uow_for(db),
    ):
        n = await auto_end_replaced_leases()

    assert n == 0
    await db.refresh(parent)
    assert parent.status == "active"


@pytest.mark.asyncio
async def test_handles_multiple_parents_in_one_cycle(
    db: AsyncSession,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    p1 = await _seed_lease(db, user_id=user_id, org_id=org_id, status="active")
    p2 = await _seed_lease(db, user_id=user_id, org_id=org_id, status="signed")
    p3 = await _seed_lease(db, user_id=user_id, org_id=org_id, status="active")
    yesterday = _dt.date.today() - _dt.timedelta(days=1)
    await _seed_lease(db, user_id=user_id, org_id=org_id, starts_on=yesterday, parent_lease_id=p1.id)
    await _seed_lease(db, user_id=user_id, org_id=org_id, starts_on=yesterday, parent_lease_id=p2.id)
    # p3 has a future-dated successor — should be skipped.
    await _seed_lease(
        db, user_id=user_id, org_id=org_id,
        starts_on=_dt.date.today() + _dt.timedelta(days=10),
        parent_lease_id=p3.id,
    )

    with patch(
        "app.workers.scheduler_worker.unit_of_work", _fake_uow_for(db),
    ):
        n = await auto_end_replaced_leases()

    assert n == 2
    await db.refresh(p1); await db.refresh(p2); await db.refresh(p3)
    assert p1.status == "ended"
    assert p2.status == "ended"
    assert p3.status == "active"
