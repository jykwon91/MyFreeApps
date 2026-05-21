"""Unit tests for lease_extension_service.

Exercises the service against the in-memory SQLite session, with storage
and the get_lease re-load mocked.

Coverage:
- Happy path: signed lease → addendum attachment + version row + ends_on updated.
- Status guard: draft / generated / sent / ended / terminated → InvalidStatus error.
- Missing current end date → MissingCurrentEndDateError.
- new_ends_on not strictly after current → NewEndDateNotAfterCurrentError.
- Tenant-isolation: lease in a different org → SignedLeaseNotFoundError.
- Storage upload failure rolls back without leaving an orphan version row.
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
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.services.leases.lease_extension_service import (
    InvalidLeaseStatusForExtensionError,
    MissingCurrentEndDateError,
    NewEndDateNotAfterCurrentError,
    SignedLeaseNotFoundError,
    extend_lease,
)


def _fake_uow_for(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


async def _seed_signed_lease(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    status: str = "signed",
    starts_on: _dt.date | None = _dt.date(2026, 1, 1),
    ends_on: _dt.date | None = _dt.date(2026, 12, 31),
) -> SignedLease:
    applicant = Applicant(
        organization_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        legal_name="Tenant Test",
    )
    db.add(applicant)
    await db.flush()

    lease = SignedLease(
        user_id=user_id,
        organization_id=org_id,
        applicant_id=applicant.id,
        kind="generated",
        status=status,
        starts_on=starts_on,
        ends_on=ends_on,
    )
    db.add(lease)
    await db.flush()
    return lease


def _patch_service(session: AsyncSession, *, storage_mock):
    """Common patches for the extension service.

    Returns a context-manager-compatible patcher; usage:
        with _patch_service(db, storage_mock=fake) as detail_mock:
            ...
    """
    fake_uow = _fake_uow_for(session)
    return patch.multiple(
        "app.services.leases.lease_extension_service",
        unit_of_work=fake_uow,
        get_storage=lambda: storage_mock,
        get_lease=AsyncMock(),
    )


@pytest.mark.asyncio
async def test_happy_path_extends_signed_lease(db: AsyncSession) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_signed_lease(db, user_id=user_id, org_id=org_id)
    lease_id = lease.id

    storage = AsyncMock()
    storage.upload_file = lambda *a, **kw: None  # sync .upload_file in real client

    fake_uow = _fake_uow_for(db)
    detail_stub = object()
    with patch(
        "app.services.leases.lease_extension_service.unit_of_work", fake_uow,
    ), patch(
        "app.services.leases.lease_extension_service.get_storage", lambda: storage,
    ), patch(
        "app.services.leases.lease_extension_service.get_lease",
        AsyncMock(return_value=detail_stub),
    ):
        detail, extended_at = await extend_lease(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease_id,
            new_ends_on=_dt.date(2027, 6, 30),
            notes="Tenant requested 6-month extension",
        )

    assert detail is detail_stub
    assert isinstance(extended_at, _dt.datetime)

    # Lease's ends_on now reflects the new date.
    await db.refresh(lease)
    assert lease.ends_on == _dt.date(2027, 6, 30)

    # An attachment with kind=signed_addendum was written.
    attachments = (
        await db.execute(
            select(SignedLeaseAttachment).where(
                SignedLeaseAttachment.lease_id == lease_id,
            )
        )
    ).scalars().all()
    assert len(attachments) == 1
    assert attachments[0].kind == "signed_addendum"
    assert attachments[0].content_type == "application/pdf"
    assert attachments[0].size_bytes > 0
    assert attachments[0].storage_key == f"signed-leases/{lease_id}/{attachments[0].id}"

    # A term-version row was written pointing at that attachment.
    versions = (
        await db.execute(
            select(LeaseTermVersion).where(LeaseTermVersion.lease_id == lease_id)
        )
    ).scalars().all()
    assert len(versions) == 1
    v = versions[0]
    assert v.starts_on == _dt.date(2026, 1, 1)
    assert v.ends_on == _dt.date(2027, 6, 30)
    assert v.source_attachment_id == attachments[0].id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", ["draft", "generated", "sent", "ended", "terminated"],
)
async def test_rejects_non_signed_active_status(
    db: AsyncSession, status: str,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_signed_lease(
        db, user_id=user_id, org_id=org_id, status=status,
    )

    storage = AsyncMock()
    storage.upload_file = lambda *a, **kw: None
    fake_uow = _fake_uow_for(db)
    with patch(
        "app.services.leases.lease_extension_service.unit_of_work", fake_uow,
    ), patch(
        "app.services.leases.lease_extension_service.get_storage", lambda: storage,
    ), pytest.raises(InvalidLeaseStatusForExtensionError):
        await extend_lease(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            new_ends_on=_dt.date(2027, 6, 30),
            notes=None,
        )


@pytest.mark.asyncio
async def test_rejects_lease_without_current_end_date(db: AsyncSession) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_signed_lease(
        db, user_id=user_id, org_id=org_id, ends_on=None,
    )

    storage = AsyncMock()
    storage.upload_file = lambda *a, **kw: None
    fake_uow = _fake_uow_for(db)
    with patch(
        "app.services.leases.lease_extension_service.unit_of_work", fake_uow,
    ), patch(
        "app.services.leases.lease_extension_service.get_storage", lambda: storage,
    ), pytest.raises(MissingCurrentEndDateError):
        await extend_lease(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            new_ends_on=_dt.date(2027, 6, 30),
            notes=None,
        )


@pytest.mark.asyncio
async def test_rejects_new_end_not_after_current(db: AsyncSession) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_signed_lease(db, user_id=user_id, org_id=org_id)

    storage = AsyncMock()
    storage.upload_file = lambda *a, **kw: None
    fake_uow = _fake_uow_for(db)
    with patch(
        "app.services.leases.lease_extension_service.unit_of_work", fake_uow,
    ), patch(
        "app.services.leases.lease_extension_service.get_storage", lambda: storage,
    ), pytest.raises(NewEndDateNotAfterCurrentError):
        await extend_lease(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            new_ends_on=_dt.date(2026, 12, 31),  # equal to current
            notes=None,
        )


@pytest.mark.asyncio
async def test_cross_tenant_returns_not_found(db: AsyncSession) -> None:
    org_a, user_a = uuid.uuid4(), uuid.uuid4()
    org_b, user_b = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_signed_lease(db, user_id=user_a, org_id=org_a)

    storage = AsyncMock()
    storage.upload_file = lambda *a, **kw: None
    fake_uow = _fake_uow_for(db)
    with patch(
        "app.services.leases.lease_extension_service.unit_of_work", fake_uow,
    ), patch(
        "app.services.leases.lease_extension_service.get_storage", lambda: storage,
    ), pytest.raises(SignedLeaseNotFoundError):
        await extend_lease(
            user_id=user_b,
            organization_id=org_b,
            lease_id=lease.id,
            new_ends_on=_dt.date(2027, 6, 30),
            notes=None,
        )


@pytest.mark.asyncio
async def test_storage_failure_cleans_up_no_partial_version(
    db: AsyncSession,
) -> None:
    """Upload succeeds, DB write fails → orphan storage object is deleted."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_signed_lease(db, user_id=user_id, org_id=org_id)

    deleted_keys: list[str] = []

    class _FailingAttachmentRepo:
        async def create(self, *args, **kwargs):  # noqa: ANN001
            raise RuntimeError("boom — simulated DB failure")

    storage = AsyncMock()
    storage.upload_file = lambda *a, **kw: None
    storage.delete_file = lambda key: deleted_keys.append(key)

    fake_uow = _fake_uow_for(db)
    with patch(
        "app.services.leases.lease_extension_service.unit_of_work", fake_uow,
    ), patch(
        "app.services.leases.lease_extension_service.get_storage", lambda: storage,
    ), patch(
        "app.services.leases.lease_extension_service.signed_lease_attachment_repo",
        _FailingAttachmentRepo(),
    ), pytest.raises(RuntimeError, match="boom"):
        await extend_lease(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            new_ends_on=_dt.date(2027, 6, 30),
            notes=None,
        )

    # The storage object was cleaned up.
    assert len(deleted_keys) == 1
    assert deleted_keys[0].startswith(f"signed-leases/{lease.id}/")

    # No term-version row was written.
    versions = (
        await db.execute(
            select(LeaseTermVersion).where(LeaseTermVersion.lease_id == lease.id)
        )
    ).scalars().all()
    assert versions == []

    # The lease's ends_on is unchanged.
    await db.refresh(lease)
    assert lease.ends_on == _dt.date(2026, 12, 31)


@pytest.mark.asyncio
async def test_extend_clears_tenant_ended_and_writes_event(
    db: AsyncSession,
) -> None:
    """Extending a lease for a manually-ended tenant restarts the tenancy.

    Without this, host's mental model ("extension means they're staying")
    silently diverges from system state (UI keeps showing the tenancy as
    ended because tenant_ended_at is non-null).
    """
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_signed_lease(db, user_id=user_id, org_id=org_id)
    applicant = (
        await db.execute(
            select(Applicant).where(Applicant.id == lease.applicant_id),
        )
    ).scalar_one()
    applicant.tenant_ended_at = _dt.datetime(2026, 6, 1, tzinfo=_dt.timezone.utc)
    applicant.tenant_ended_reason = "moved out"
    await db.flush()

    storage = AsyncMock()
    storage.upload_file = lambda *a, **kw: None
    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), patch(
        "app.services.leases.lease_extension_service.get_storage", lambda: storage,
    ), patch(
        "app.services.leases.lease_extension_service.get_lease",
        AsyncMock(return_value=object()),
    ):
        await extend_lease(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            new_ends_on=_dt.date(2027, 6, 30),
            notes=None,
        )

    await db.refresh(applicant)
    assert applicant.tenant_ended_at is None
    assert applicant.tenant_ended_reason is None

    events = (
        await db.execute(
            select(ApplicantEvent).where(
                ApplicantEvent.applicant_id == applicant.id,
            )
        )
    ).scalars().all()
    assert len(events) == 1
    evt = events[0]
    assert evt.event_type == "tenancy_extended"
    assert evt.actor == "host"
    assert evt.payload["tenancy_restarted"] is True
    assert evt.payload["new_ends_on"] == "2027-06-30"
    assert evt.payload["previous_ends_on"] == "2026-12-31"
    assert evt.payload["lease_id"] == str(lease.id)


@pytest.mark.asyncio
async def test_extend_with_active_tenancy_writes_event_without_clearing(
    db: AsyncSession,
) -> None:
    """The normal-path extension still writes a timeline event, no clear needed."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    lease = await _seed_signed_lease(db, user_id=user_id, org_id=org_id)
    applicant = (
        await db.execute(
            select(Applicant).where(Applicant.id == lease.applicant_id),
        )
    ).scalar_one()
    assert applicant.tenant_ended_at is None  # baseline

    storage = AsyncMock()
    storage.upload_file = lambda *a, **kw: None
    with patch(
        "app.services.leases.lease_extension_service.unit_of_work",
        _fake_uow_for(db),
    ), patch(
        "app.services.leases.lease_extension_service.get_storage", lambda: storage,
    ), patch(
        "app.services.leases.lease_extension_service.get_lease",
        AsyncMock(return_value=object()),
    ):
        await extend_lease(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            new_ends_on=_dt.date(2027, 6, 30),
            notes=None,
        )

    await db.refresh(applicant)
    assert applicant.tenant_ended_at is None

    events = (
        await db.execute(
            select(ApplicantEvent).where(
                ApplicantEvent.applicant_id == applicant.id,
            )
        )
    ).scalars().all()
    assert len(events) == 1
    assert events[0].event_type == "tenancy_extended"
    assert events[0].payload["tenancy_restarted"] is False


