"""Unit tests for lease_extension_service.undo_extension.

Exercises the service against an in-memory SQLite session.

Coverage:
- Happy path: latest extension within window → soft-deleted, lease.ends_on
  recomputes from the next-latest row (or seed when only one extension).
- Refuses seed row.
- Refuses non-latest extension when a newer live extension exists.
- Refuses when the 30-day window has expired.
- Refuses extension on a different lease (cross-tenant IDOR via composite WHERE).
- Cross-tenant: lease in a different org → SignedLeaseNotFoundError.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.leases.lease_term_version import LeaseTermVersion
from app.models.leases.signed_lease import SignedLease
from app.services.leases._lease_helpers import _resolve_latest_extension
from app.services.leases.lease_extension_service import (
    CannotUndoSeedRowError,
    ExtensionNotFoundError,
    NoEarlierTermError,
    NotLatestExtensionError,
    SignedLeaseNotFoundError,
    UNDO_WINDOW_DAYS,
    UndoWindowExpiredError,
    undo_extension,
)


def _fake_uow_for(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


async def _seed_lease_with_seed_version(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
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
        kind="generated",
        status="signed",
        starts_on=_dt.date(2026, 1, 1),
        ends_on=_dt.date(2026, 12, 31),
    )
    db.add(lease)
    await db.flush()

    seed = LeaseTermVersion(
        lease_id=lease.id,
        starts_on=lease.starts_on,
        ends_on=lease.ends_on,
        source_attachment_id=None,
        created_by_user_id=user_id,
        created_at=_dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc),
    )
    db.add(seed)
    await db.flush()
    return lease


async def _seed_extension(
    db: AsyncSession,
    *,
    lease: SignedLease,
    user_id: uuid.UUID,
    ends_on: _dt.date,
    age_days: int = 1,
) -> LeaseTermVersion:
    now = _dt.datetime.now(_dt.timezone.utc)
    version = LeaseTermVersion(
        lease_id=lease.id,
        starts_on=lease.starts_on,
        ends_on=ends_on,
        # FK is normally to signed_lease_attachments.id; for these unit tests
        # we just need a non-null UUID — FK enforcement is OFF in conftest.
        source_attachment_id=uuid.uuid4(),
        created_by_user_id=user_id,
        created_at=now - _dt.timedelta(days=age_days),
    )
    db.add(version)
    await db.flush()
    # Reflect the extension on the lease (the real service does this).
    lease.ends_on = ends_on
    await db.flush()
    return version


@pytest.mark.asyncio
async def test_happy_path_undoes_single_extension(db: AsyncSession) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_lease_with_seed_version(
        db, user_id=user_id, org_id=org_id,
    )
    version = await _seed_extension(
        db, lease=lease, user_id=user_id, ends_on=_dt.date(2027, 6, 30),
    )

    detail_stub = object()
    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), patch(
        "app.services.leases.lease_extension_service.get_lease",
        AsyncMock(return_value=detail_stub),
    ):
        result = await undo_extension(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            version_id=version.id,
        )

    assert result is detail_stub

    # The version was soft-deleted.
    refreshed = (
        await db.execute(
            select(LeaseTermVersion).where(LeaseTermVersion.id == version.id)
        )
    ).scalar_one()
    assert refreshed.deleted_at is not None

    # Lease.ends_on rolled back to the seed's value.
    await db.refresh(lease)
    assert lease.ends_on == _dt.date(2026, 12, 31)


@pytest.mark.asyncio
async def test_undo_returns_to_previous_extension(db: AsyncSession) -> None:
    """Two extensions stacked: undoing the latest returns ends_on to the prior one."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_lease_with_seed_version(
        db, user_id=user_id, org_id=org_id,
    )
    await _seed_extension(
        db, lease=lease, user_id=user_id,
        ends_on=_dt.date(2027, 6, 30), age_days=10,
    )
    latest = await _seed_extension(
        db, lease=lease, user_id=user_id,
        ends_on=_dt.date(2028, 6, 30), age_days=1,
    )

    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), patch(
        "app.services.leases.lease_extension_service.get_lease",
        AsyncMock(return_value=object()),
    ):
        await undo_extension(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            version_id=latest.id,
        )

    await db.refresh(lease)
    assert lease.ends_on == _dt.date(2027, 6, 30)


@pytest.mark.asyncio
async def test_refuses_seed_row(db: AsyncSession) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_lease_with_seed_version(
        db, user_id=user_id, org_id=org_id,
    )
    seed_row = (
        await db.execute(
            select(LeaseTermVersion).where(
                LeaseTermVersion.lease_id == lease.id,
            )
        )
    ).scalar_one()

    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), pytest.raises(CannotUndoSeedRowError):
        await undo_extension(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            version_id=seed_row.id,
        )


@pytest.mark.asyncio
async def test_refuses_non_latest_extension(db: AsyncSession) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_lease_with_seed_version(
        db, user_id=user_id, org_id=org_id,
    )
    older = await _seed_extension(
        db, lease=lease, user_id=user_id,
        ends_on=_dt.date(2027, 6, 30), age_days=10,
    )
    await _seed_extension(
        db, lease=lease, user_id=user_id,
        ends_on=_dt.date(2028, 6, 30), age_days=1,
    )

    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), pytest.raises(NotLatestExtensionError):
        await undo_extension(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            version_id=older.id,
        )


@pytest.mark.asyncio
async def test_refuses_after_window_expired(db: AsyncSession) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_lease_with_seed_version(
        db, user_id=user_id, org_id=org_id,
    )
    version = await _seed_extension(
        db, lease=lease, user_id=user_id,
        ends_on=_dt.date(2027, 6, 30), age_days=UNDO_WINDOW_DAYS + 1,
    )

    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), pytest.raises(UndoWindowExpiredError):
        await undo_extension(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            version_id=version.id,
        )


@pytest.mark.asyncio
async def test_extension_not_found_for_different_lease(db: AsyncSession) -> None:
    """Composite WHERE: version_id on lease A cannot be undone via lease B."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease_a = await _seed_lease_with_seed_version(
        db, user_id=user_id, org_id=org_id,
    )
    lease_b = await _seed_lease_with_seed_version(
        db, user_id=user_id, org_id=org_id,
    )
    version_on_a = await _seed_extension(
        db, lease=lease_a, user_id=user_id, ends_on=_dt.date(2027, 6, 30),
    )

    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), pytest.raises(ExtensionNotFoundError):
        await undo_extension(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease_b.id,
            version_id=version_on_a.id,
        )


@pytest.mark.asyncio
async def test_cross_tenant_lease_returns_not_found(db: AsyncSession) -> None:
    org_a, user_a = uuid.uuid4(), uuid.uuid4()
    org_b, user_b = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_lease_with_seed_version(
        db, user_id=user_a, org_id=org_a,
    )

    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), pytest.raises(SignedLeaseNotFoundError):
        await undo_extension(
            user_id=user_b,
            organization_id=org_b,
            lease_id=lease.id,
            version_id=uuid.uuid4(),
        )


@pytest.mark.asyncio
async def test_undo_writes_extension_undone_event(db: AsyncSession) -> None:
    """Undoing an extension records a timeline event so the host can see why
    the lease's ends_on rolled back."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_lease_with_seed_version(
        db, user_id=user_id, org_id=org_id,
    )
    version = await _seed_extension(
        db, lease=lease, user_id=user_id, ends_on=_dt.date(2027, 6, 30),
    )

    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), patch(
        "app.services.leases.lease_extension_service.get_lease",
        AsyncMock(return_value=object()),
    ):
        await undo_extension(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            version_id=version.id,
        )

    events = (
        await db.execute(
            select(ApplicantEvent).where(
                ApplicantEvent.applicant_id == lease.applicant_id,
            )
        )
    ).scalars().all()
    assert len(events) == 1
    evt = events[0]
    assert evt.event_type == "extension_undone"
    assert evt.actor == "host"
    assert evt.payload["lease_id"] == str(lease.id)
    assert evt.payload["undone_version_id"] == str(version.id)
    assert evt.payload["new_ends_on"] == "2026-12-31"


@pytest.mark.asyncio
async def test_summary_says_where_undo_goes_back_to_and_until_when(db: AsyncSession) -> None:
    user_id = uuid.uuid4()
    lease = await _seed_lease_with_seed_version(db, user_id=user_id, org_id=uuid.uuid4())

    assert await _resolve_latest_extension(db, lease_id=lease.id) is None

    first = await _seed_extension(
        db, lease=lease, user_id=user_id, ends_on=_dt.date(2027, 6, 30), age_days=5,
    )
    summary = await _resolve_latest_extension(db, lease_id=lease.id)
    assert summary is not None
    assert summary.id == first.id
    assert summary.previous_ends_on == _dt.date(2026, 12, 31)
    assert summary.undo_expires_at == first.created_at + _dt.timedelta(days=UNDO_WINDOW_DAYS)
    assert summary.can_undo is True

    second = await _seed_extension(
        db, lease=lease, user_id=user_id, ends_on=_dt.date(2027, 12, 31),
    )
    summary = await _resolve_latest_extension(db, lease_id=lease.id)
    assert summary is not None
    assert summary.id == second.id
    assert summary.previous_ends_on == _dt.date(2027, 6, 30)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("age_days", "expected"),
    [(UNDO_WINDOW_DAYS - 1, True), (UNDO_WINDOW_DAYS, False), (UNDO_WINDOW_DAYS + 1, False)],
)
async def test_summary_can_undo_matches_what_undo_accepts(
    db: AsyncSession, age_days: int, expected: bool,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_lease_with_seed_version(db, user_id=user_id, org_id=org_id)
    version = await _seed_extension(
        db, lease=lease, user_id=user_id, ends_on=_dt.date(2027, 6, 30), age_days=age_days,
    )
    summary = await _resolve_latest_extension(db, lease_id=lease.id)
    assert summary is not None
    assert summary.can_undo is expected

    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), patch(
        "app.services.leases.lease_extension_service.get_lease",
        AsyncMock(return_value=object()),
    ):
        if expected:
            await undo_extension(
                user_id=user_id, organization_id=org_id, lease_id=lease.id, version_id=version.id,
            )
        else:
            with pytest.raises(UndoWindowExpiredError):
                await undo_extension(
                    user_id=user_id, organization_id=org_id, lease_id=lease.id, version_id=version.id,
                )


@pytest.mark.asyncio
async def test_lease_with_no_seed_refuses_undo_rather_than_keeping_the_extended_date(
    db: AsyncSession,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_lease_with_seed_version(db, user_id=user_id, org_id=org_id)
    for row in (await db.execute(select(LeaseTermVersion))).scalars().all():
        await db.delete(row)
    await db.flush()
    version = await _seed_extension(
        db, lease=lease, user_id=user_id, ends_on=_dt.date(2027, 6, 30),
    )

    summary = await _resolve_latest_extension(db, lease_id=lease.id)
    assert summary is not None
    assert summary.previous_ends_on is None
    assert summary.can_undo is False

    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), pytest.raises(NoEarlierTermError):
        await undo_extension(
            user_id=user_id, organization_id=org_id, lease_id=lease.id, version_id=version.id,
        )
    assert version.deleted_at is None
    assert lease.ends_on == _dt.date(2027, 6, 30)
