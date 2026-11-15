"""Tests for the auto-end-replaced-leases scheduler task.

The task finds signed/active parent leases whose successor's ``starts_on``
has arrived in the host's time zone (the tenant's rent reminder plan zone,
else the default) and transitions them to ``ended``. Per-row failures are
logged and do not stop the cycle.
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
from app.models.rent.rent_reminder_plan import RentReminderPlan
from app.workers.scheduler_worker import auto_end_replaced_leases
from tests.utc_today import utc_today

_UOW = "app.services.leases.lease_handover_service.unit_of_work"
_NOW = "app.workers.scheduler_worker._now"

# 6pm in Chicago on Nov 14 — already Nov 15 in UTC.
_CHICAGO_EVENING_BEFORE = _dt.datetime(2026, 11, 15, 0, 0, tzinfo=_dt.timezone.utc)
# 12:30am in Chicago on Nov 15.
_CHICAGO_AFTER_MIDNIGHT = _dt.datetime(2026, 11, 15, 6, 30, tzinfo=_dt.timezone.utc)
_NOV_15 = _dt.date(2026, 11, 15)


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
    applicant_id: uuid.UUID | None = None,
) -> SignedLease:
    if applicant_id is None:
        applicant = Applicant(
            organization_id=org_id,
            user_id=user_id,
            stage="lease_signed",
            legal_name="Tenant",
        )
        db.add(applicant)
        await db.flush()
        applicant_id = applicant.id
    lease = SignedLease(
        user_id=user_id,
        organization_id=org_id,
        applicant_id=applicant_id,
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


async def _seed_plan(db: AsyncSession, lease: SignedLease, timezone: str) -> None:
    db.add(RentReminderPlan(
        user_id=lease.user_id,
        organization_id=lease.organization_id,
        applicant_id=lease.applicant_id,
        frequency="monthly",
        timezone=timezone,
    ))
    await db.flush()


async def _renewal(
    db: AsyncSession, *, starts_on: _dt.date = _NOV_15,
) -> tuple[SignedLease, SignedLease]:
    """A current lease and the same tenant's renewal starting ``starts_on``."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id)
    successor = await _seed_lease(
        db, user_id=user_id, org_id=org_id, starts_on=starts_on,
        parent_lease_id=parent.id, applicant_id=parent.applicant_id,
    )
    return parent, successor


async def _run_at(db: AsyncSession, now: _dt.datetime) -> int:
    with patch(_UOW, _fake_uow_for(db)), patch(_NOW, return_value=now):
        return await auto_end_replaced_leases()


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
        starts_on=utc_today() - _dt.timedelta(days=1),
        parent_lease_id=parent.id,
    )

    with patch(
        _UOW, _fake_uow_for(db),
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
        starts_on=utc_today() + _dt.timedelta(days=30),
        parent_lease_id=parent.id,
    )

    with patch(
        _UOW, _fake_uow_for(db),
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
        starts_on=utc_today() - _dt.timedelta(days=1),
        parent_lease_id=parent.id,
    )

    with patch(
        _UOW, _fake_uow_for(db),
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
        starts_on=utc_today() - _dt.timedelta(days=1),
        parent_lease_id=parent.id,
        deleted_at=_dt.datetime.now(_dt.timezone.utc),
    )

    with patch(
        _UOW, _fake_uow_for(db),
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
    yesterday = utc_today() - _dt.timedelta(days=1)
    await _seed_lease(db, user_id=user_id, org_id=org_id, starts_on=yesterday, parent_lease_id=p1.id)
    await _seed_lease(db, user_id=user_id, org_id=org_id, starts_on=yesterday, parent_lease_id=p2.id)
    # p3 has a future-dated successor — should be skipped.
    await _seed_lease(
        db, user_id=user_id, org_id=org_id,
        starts_on=utc_today() + _dt.timedelta(days=10),
        parent_lease_id=p3.id,
    )

    with patch(
        _UOW, _fake_uow_for(db),
    ):
        n = await auto_end_replaced_leases()

    assert n == 2
    await db.refresh(p1); await db.refresh(p2); await db.refresh(p3)
    assert p1.status == "ended"
    assert p2.status == "ended"
    assert p3.status == "active"


@pytest.mark.asyncio
async def test_not_handed_over_the_evening_before_in_the_plans_zone(
    db: AsyncSession,
) -> None:
    parent, _ = await _renewal(db)
    await _seed_plan(db, parent, "America/Chicago")

    assert await _run_at(db, _CHICAGO_EVENING_BEFORE) == 0
    await db.refresh(parent)
    assert parent.status == "active"


@pytest.mark.asyncio
async def test_handed_over_after_local_midnight_in_the_plans_zone(
    db: AsyncSession,
) -> None:
    parent, _ = await _renewal(db)
    await _seed_plan(db, parent, "America/Chicago")

    assert await _run_at(db, _CHICAGO_AFTER_MIDNIGHT) == 1
    await db.refresh(parent)
    assert parent.status == "ended"
    assert parent.ended_at is not None


@pytest.mark.asyncio
async def test_a_zone_ahead_of_utc_hands_over_before_the_utc_date_arrives(
    db: AsyncSession,
) -> None:
    parent, _ = await _renewal(db)
    await _seed_plan(db, parent, "Asia/Tokyo")

    # 1am Nov 15 in Tokyo, still Nov 14 in UTC.
    tokyo_after_midnight = _dt.datetime(2026, 11, 14, 16, 0, tzinfo=_dt.timezone.utc)
    assert await _run_at(db, tokyo_after_midnight) == 1


@pytest.mark.asyncio
async def test_uses_the_outgoing_tenants_plan_when_the_new_tenant_has_none(
    db: AsyncSession,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id)
    await _seed_plan(db, parent, "Asia/Tokyo")
    await _seed_lease(  # a different tenant moving in
        db, user_id=user_id, org_id=org_id, starts_on=_NOV_15, parent_lease_id=parent.id,
    )

    assert await _run_at(db, _dt.datetime(2026, 11, 14, 16, 0, tzinfo=_dt.timezone.utc)) == 1


@pytest.mark.asyncio
async def test_the_new_tenants_plan_wins_over_the_outgoing_tenants(
    db: AsyncSession,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id)
    await _seed_plan(db, parent, "Asia/Tokyo")
    successor = await _seed_lease(
        db, user_id=user_id, org_id=org_id, starts_on=_NOV_15, parent_lease_id=parent.id,
    )
    await _seed_plan(db, successor, "America/Chicago")

    assert await _run_at(db, _dt.datetime(2026, 11, 14, 16, 0, tzinfo=_dt.timezone.utc)) == 0


@pytest.mark.asyncio
async def test_without_a_plan_hands_over_on_the_default_zones_date(
    db: AsyncSession,
) -> None:
    parent, _ = await _renewal(db)

    assert await _run_at(db, _CHICAGO_EVENING_BEFORE) == 0
    assert await _run_at(db, _CHICAGO_AFTER_MIDNIGHT) == 1
    await db.refresh(parent)
    assert parent.status == "ended"
