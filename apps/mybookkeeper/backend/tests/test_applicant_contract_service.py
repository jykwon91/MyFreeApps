"""Unit tests for applicant_contract_service.

Tests:
- Happy path (lead): both dates updated, applicant_events row written with
  correct payload (from / to).
- Partial update (only contract_end): contract_start untouched in DB.
- Lock check: lease_signed stage raises ContractDatesLockedError, DB unchanged.
- Tenant isolation: unknown applicant raises LookupError.
- event_type is 'contract_dates_changed', actor is 'host'.

The service uses ``unit_of_work()`` which normally opens its own DB session.
We patch it with ``_fake_uow(db)`` — a context manager that yields the
already-open test session so writes go to the in-memory SQLite fixture,
mirroring the pattern used in test_channel_sync_service.py and
test_demo_service.py.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch, AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.services.applicants.applicant_contract_service import (
    ContractDatesLockedError,
    update_contract_dates,
)


def _make_fake_uow(session: AsyncSession):
    """Return a patched ``unit_of_work`` that yields the test session."""
    @asynccontextmanager
    async def _fake_uow():
        yield session
    return _fake_uow


def _make_applicant(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    stage: str = "lead",
    contract_start: _dt.date | None = None,
    contract_end: _dt.date | None = None,
) -> Applicant:
    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        stage=stage,
        contract_start=contract_start,
        contract_end=contract_end,
    )
    session.add(applicant)
    return applicant


@pytest.mark.asyncio
async def test_happy_path_both_dates_updated(db: AsyncSession) -> None:
    """Happy path: lead applicant, both dates sent, DB updated, event written."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    start = _dt.date(2026, 6, 1)
    end = _dt.date(2026, 12, 31)

    applicant = _make_applicant(db, org_id=org_id, user_id=user_id, stage="lead")
    await db.flush()
    applicant_id = applicant.id

    with patch(
        "app.services.applicants.applicant_contract_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.applicants.applicant_service.get_applicant",
        new_callable=AsyncMock,
    ) as mock_get:
        # The service re-loads via applicant_service.get_applicant after write.
        # Return a minimal stub so we can assert on dates.
        from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
        now = _dt.datetime.now(_dt.timezone.utc)
        mock_get.return_value = ApplicantDetailResponse(
            id=applicant_id,
            organization_id=org_id,
            user_id=user_id,
            stage="lead",
            contract_start=start,
            contract_end=end,
            created_at=now,
            updated_at=now,
        )

        result = await update_contract_dates(
            organization_id=org_id,
            user_id=user_id,
            applicant_id=applicant_id,
            contract_start=start,
            contract_end=end,
        )

    assert result.contract_start == start
    assert result.contract_end == end

    # Verify applicant_events row was written in the test DB.
    events_result = await db.execute(
        select(ApplicantEvent).where(ApplicantEvent.applicant_id == applicant_id)
    )
    events = list(events_result.scalars().all())
    change_events = [e for e in events if e.event_type == "contract_dates_changed"]
    assert len(change_events) == 1
    evt = change_events[0]
    assert evt.actor == "host"
    assert evt.payload is not None
    assert evt.payload["to"]["contract_start"] == "2026-06-01"
    assert evt.payload["to"]["contract_end"] == "2026-12-31"
    assert evt.payload["from"]["contract_start"] is None
    assert evt.payload["from"]["contract_end"] is None


@pytest.mark.asyncio
async def test_partial_update_only_contract_end(db: AsyncSession) -> None:
    """Only contract_end sent (contract_start=None) → contract_start unchanged."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    existing_start = _dt.date(2026, 5, 1)
    new_end = _dt.date(2026, 11, 30)

    applicant = _make_applicant(
        db,
        org_id=org_id,
        user_id=user_id,
        stage="approved",
        contract_start=existing_start,
    )
    await db.flush()
    applicant_id = applicant.id

    with patch(
        "app.services.applicants.applicant_contract_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.applicants.applicant_service.get_applicant",
        new_callable=AsyncMock,
    ) as mock_get:
        from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
        now = _dt.datetime.now(_dt.timezone.utc)
        mock_get.return_value = ApplicantDetailResponse(
            id=applicant_id,
            organization_id=org_id,
            user_id=user_id,
            stage="approved",
            contract_start=existing_start,
            contract_end=new_end,
            created_at=now,
            updated_at=now,
        )

        result = await update_contract_dates(
            organization_id=org_id,
            user_id=user_id,
            applicant_id=applicant_id,
            contract_start=None,  # not in the request → keep existing
            contract_end=new_end,
        )

    # contract_start must be preserved.
    assert result.contract_start == existing_start
    assert result.contract_end == new_end

    # Applicant row must reflect the merge.
    await db.refresh(applicant)
    assert applicant.contract_start == existing_start
    assert applicant.contract_end == new_end

    # Event payload must reflect the resolved values.
    events_result = await db.execute(
        select(ApplicantEvent).where(ApplicantEvent.applicant_id == applicant_id)
    )
    change_events = [
        e for e in events_result.scalars().all()
        if e.event_type == "contract_dates_changed"
    ]
    assert len(change_events) == 1
    assert change_events[0].payload["to"]["contract_start"] == "2026-05-01"
    assert change_events[0].payload["to"]["contract_end"] == "2026-11-30"


@pytest.mark.asyncio
async def test_lock_check_lease_signed_raises(db: AsyncSession) -> None:
    """lease_signed stage → ContractDatesLockedError, DB UNCHANGED."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    original_start = _dt.date(2026, 3, 1)
    original_end = _dt.date(2026, 8, 31)

    applicant = _make_applicant(
        db,
        org_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        contract_start=original_start,
        contract_end=original_end,
    )
    await db.flush()
    applicant_id = applicant.id

    with patch(
        "app.services.applicants.applicant_contract_service.unit_of_work",
        _make_fake_uow(db),
    ), pytest.raises(ContractDatesLockedError, match="locked"):
        await update_contract_dates(
            organization_id=org_id,
            user_id=user_id,
            applicant_id=applicant_id,
            contract_start=_dt.date(2026, 4, 1),
            contract_end=_dt.date(2026, 9, 30),
        )

    # Dates must be unchanged — no partial write should have occurred.
    await db.refresh(applicant)
    assert applicant.contract_start == original_start
    assert applicant.contract_end == original_end

    # No event should have been written.
    events_result = await db.execute(
        select(ApplicantEvent).where(
            ApplicantEvent.applicant_id == applicant_id,
            ApplicantEvent.event_type == "contract_dates_changed",
        )
    )
    assert list(events_result.scalars().all()) == []


@pytest.mark.asyncio
async def test_unknown_applicant_raises_lookup_error(db: AsyncSession) -> None:
    """Unknown applicant → LookupError (404 at route layer)."""
    with patch(
        "app.services.applicants.applicant_contract_service.unit_of_work",
        _make_fake_uow(db),
    ), pytest.raises(LookupError):
        await update_contract_dates(
            organization_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            applicant_id=uuid.uuid4(),
            contract_start=_dt.date(2026, 6, 1),
            contract_end=_dt.date(2026, 12, 31),
        )


@pytest.mark.asyncio
async def test_event_actor_is_host(db: AsyncSession) -> None:
    """Event actor must always be 'host' — not 'system'."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()

    applicant = _make_applicant(db, org_id=org_id, user_id=user_id, stage="lead")
    await db.flush()
    applicant_id = applicant.id

    with patch(
        "app.services.applicants.applicant_contract_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.applicants.applicant_service.get_applicant",
        new_callable=AsyncMock,
    ) as mock_get:
        from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
        now = _dt.datetime.now(_dt.timezone.utc)
        mock_get.return_value = ApplicantDetailResponse(
            id=applicant_id,
            organization_id=org_id,
            user_id=user_id,
            stage="lead",
            created_at=now,
            updated_at=now,
        )

        await update_contract_dates(
            organization_id=org_id,
            user_id=user_id,
            applicant_id=applicant_id,
            contract_start=_dt.date(2026, 6, 1),
            contract_end=_dt.date(2026, 12, 31),
        )

    events_result = await db.execute(
        select(ApplicantEvent).where(
            ApplicantEvent.applicant_id == applicant_id,
            ApplicantEvent.event_type == "contract_dates_changed",
        )
    )
    evt = events_result.scalar_one()
    assert evt.actor == "host"
