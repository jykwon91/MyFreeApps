"""Unit tests for applicant_contract_service.

Post-PR-1b scope: only ``contract_start`` is mutable on the applicant.
``contract_end`` is derived from the latest signed lease's ``ends_on`` and
is therefore not accepted by the service.

Tests:
- Happy path (lead): ``contract_start`` updated, applicant_events row written.
- Partial update: omitted ``contract_start`` preserves existing value.
- Lock check: lease_signed stage raises ContractDatesLockedError, DB unchanged.
- Tenant isolation: unknown applicant raises LookupError.
- event_type is 'contract_dates_changed', actor is 'host'.

The service uses ``unit_of_work()`` which normally opens its own DB session.
We patch it with ``_fake_uow(db)`` — a context manager that yields the
already-open test session so writes go to the in-memory SQLite fixture.
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
) -> Applicant:
    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        stage=stage,
        contract_start=contract_start,
    )
    session.add(applicant)
    return applicant


@pytest.mark.asyncio
async def test_happy_path_contract_start_updated(db: AsyncSession) -> None:
    """Happy path: lead applicant, contract_start sent, DB updated, event written."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    start = _dt.date(2026, 6, 1)

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
            contract_start=start,
            contract_end=None,
            created_at=now,
            updated_at=now,
        )

        result = await update_contract_dates(
            organization_id=org_id,
            user_id=user_id,
            applicant_id=applicant_id,
            contract_start=start,
            contract_start_sent=True,
        )

    assert result.contract_start == start

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
    assert evt.payload["from"]["contract_start"] is None


@pytest.mark.asyncio
async def test_partial_update_contract_start_omitted(db: AsyncSession) -> None:
    """``contract_start_sent=False`` → existing value preserved."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    existing_start = _dt.date(2026, 5, 1)

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
            contract_end=None,
            created_at=now,
            updated_at=now,
        )

        result = await update_contract_dates(
            organization_id=org_id,
            user_id=user_id,
            applicant_id=applicant_id,
            contract_start=None,
            contract_start_sent=False,
        )

    assert result.contract_start == existing_start

    await db.refresh(applicant)
    assert applicant.contract_start == existing_start


@pytest.mark.asyncio
async def test_explicit_null_clears_contract_start(db: AsyncSession) -> None:
    """``contract_start_sent=True`` with ``None`` value → DB column cleared."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    existing_start = _dt.date(2026, 5, 1)

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
            contract_start=None,
            contract_end=None,
            created_at=now,
            updated_at=now,
        )

        await update_contract_dates(
            organization_id=org_id,
            user_id=user_id,
            applicant_id=applicant_id,
            contract_start=None,
            contract_start_sent=True,
        )

    await db.refresh(applicant)
    assert applicant.contract_start is None

    events_result = await db.execute(
        select(ApplicantEvent).where(ApplicantEvent.applicant_id == applicant_id)
    )
    change_events = [
        e for e in events_result.scalars().all()
        if e.event_type == "contract_dates_changed"
    ]
    assert len(change_events) == 1
    assert change_events[0].payload["from"]["contract_start"] == "2026-05-01"
    assert change_events[0].payload["to"]["contract_start"] is None


@pytest.mark.asyncio
async def test_lock_check_lease_signed_raises(db: AsyncSession) -> None:
    """lease_signed stage → ContractDatesLockedError, DB UNCHANGED."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    original_start = _dt.date(2026, 3, 1)

    applicant = _make_applicant(
        db,
        org_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        contract_start=original_start,
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
            contract_start_sent=True,
        )

    await db.refresh(applicant)
    assert applicant.contract_start == original_start

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
            contract_start_sent=True,
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
            contract_start_sent=True,
        )

    events_result = await db.execute(
        select(ApplicantEvent).where(
            ApplicantEvent.applicant_id == applicant_id,
            ApplicantEvent.event_type == "contract_dates_changed",
        )
    )
    evt = events_result.scalar_one()
    assert evt.actor == "host"
