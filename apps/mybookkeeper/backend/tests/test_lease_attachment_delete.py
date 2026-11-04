"""An addendum can't be deleted while it's the record of a live extension."""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.leases.lease_term_version import LeaseTermVersion
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.models.organization.organization_member import OrgRole
from app.services.leases import lease_attachment_service, signed_lease_service

NOW = _dt.datetime(2026, 10, 1, tzinfo=_dt.timezone.utc)


async def _lease_with_extension(
    db: AsyncSession, *, deleted_at: _dt.datetime | None = None,
) -> tuple[SignedLease, SignedLeaseAttachment, LeaseTermVersion]:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    applicant = Applicant(organization_id=org_id, user_id=user_id, stage="lease_signed")
    db.add(applicant)
    await db.flush()
    lease = SignedLease(
        user_id=user_id,
        organization_id=org_id,
        applicant_id=applicant.id,
        kind="imported",
        status="active",
        starts_on=_dt.date(2026, 1, 1),
        ends_on=_dt.date(2027, 6, 30),
    )
    db.add(lease)
    await db.flush()
    addendum = SignedLeaseAttachment(
        lease_id=lease.id,
        storage_key=f"signed-leases/{lease.id}/addendum",
        filename="addendum.pdf",
        content_type="application/pdf",
        size_bytes=1,
        kind="signed_addendum",
        uploaded_by_user_id=user_id,
    )
    db.add(addendum)
    await db.flush()
    version = LeaseTermVersion(
        lease_id=lease.id,
        starts_on=lease.starts_on,
        ends_on=lease.ends_on,
        source_attachment_id=addendum.id,
        created_by_user_id=user_id,
        created_at=NOW,
        deleted_at=deleted_at,
    )
    db.add(version)
    await db.flush()
    return lease, addendum, version


def _patches(db: AsyncSession, storage: MagicMock):
    @asynccontextmanager
    async def _uow():
        yield db

    return patch.multiple(
        "app.services.leases.lease_attachment_service",
        unit_of_work=_uow,
        get_storage=lambda: storage,
    )


async def _delete(db: AsyncSession, lease: SignedLease, attachment: SignedLeaseAttachment) -> None:
    await lease_attachment_service.delete_attachment(
        user_id=lease.user_id,
        organization_id=lease.organization_id,
        lease_id=lease.id,
        attachment_id=attachment.id,
    )


@pytest.mark.asyncio
async def test_refuses_while_the_extension_is_live_and_changes_nothing(db: AsyncSession) -> None:
    lease, addendum, version = await _lease_with_extension(db)
    storage = MagicMock()

    with _patches(db, storage), pytest.raises(signed_lease_service.AttachmentBacksExtensionError):
        await _delete(db, lease, addendum)

    assert await db.get(SignedLeaseAttachment, addendum.id) is not None
    assert version.source_attachment_id == addendum.id
    storage.delete_file.assert_not_called()


@pytest.mark.asyncio
async def test_allows_it_once_the_extension_is_undone(db: AsyncSession) -> None:
    lease, addendum, _version = await _lease_with_extension(db, deleted_at=NOW)
    storage = MagicMock()

    with _patches(db, storage):
        await _delete(db, lease, addendum)

    remaining = await db.execute(
        select(SignedLeaseAttachment).where(SignedLeaseAttachment.id == addendum.id),
    )
    assert remaining.scalar_one_or_none() is None
    storage.delete_file.assert_called_once_with(addendum.storage_key)


@pytest.mark.asyncio
async def test_other_files_on_the_lease_still_delete(db: AsyncSession) -> None:
    lease, _addendum, _version = await _lease_with_extension(db)
    notice = SignedLeaseAttachment(
        lease_id=lease.id,
        storage_key=f"signed-leases/{lease.id}/notice",
        filename="notice.pdf",
        content_type="application/pdf",
        size_bytes=1,
        kind="notice",
        uploaded_by_user_id=lease.user_id,
    )
    db.add(notice)
    await db.flush()
    storage = MagicMock()

    with _patches(db, storage):
        await _delete(db, lease, notice)

    storage.delete_file.assert_called_once_with(notice.storage_key)


@pytest.mark.asyncio
async def test_kind_cant_change_while_the_extension_is_live(db: AsyncSession) -> None:
    """Regenerate deletes every rendered_original, so this would delete it anyway."""
    lease, addendum, _version = await _lease_with_extension(db)

    with _patches(db, MagicMock()), pytest.raises(signed_lease_service.AttachmentBacksExtensionError):
        await lease_attachment_service.update_attachment_kind(
            user_id=lease.user_id,
            organization_id=lease.organization_id,
            lease_id=lease.id,
            attachment_id=addendum.id,
            kind="rendered_original",
        )

    assert addendum.kind == "signed_addendum"


def test_kind_route_answers_409_with_a_code() -> None:
    lease_id, attachment_id = uuid.uuid4(), uuid.uuid4()
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[require_write_access] = lambda: ctx
    try:
        with patch(
            "app.api.signed_lease_attachments.signed_lease_service.update_attachment_kind",
            AsyncMock(side_effect=signed_lease_service.AttachmentBacksExtensionError("live")),
        ):
            response = TestClient(app).patch(
                f"/signed-leases/{lease_id}/attachments/{attachment_id}",
                json={"kind": "notice"},
            )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "ATTACHMENT_BACKS_EXTENSION"
    finally:
        app.dependency_overrides.clear()


def test_route_answers_409_with_a_code() -> None:
    lease_id, attachment_id = uuid.uuid4(), uuid.uuid4()
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[require_write_access] = lambda: ctx
    try:
        with patch(
            "app.api.signed_lease_attachments.signed_lease_service.delete_attachment",
            AsyncMock(side_effect=signed_lease_service.AttachmentBacksExtensionError("live")),
        ):
            response = TestClient(app).delete(
                f"/signed-leases/{lease_id}/attachments/{attachment_id}",
            )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "ATTACHMENT_BACKS_EXTENSION"
    finally:
        app.dependency_overrides.clear()
